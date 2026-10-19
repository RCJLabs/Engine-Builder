/**
 * ink expressions, as far as the subset goes (docs/specs/ink.md#conditions): whole numbers,
 * strings, true and false, calls of EXTERNALs, the six comparisons, and, or, not and brackets.
 * Variables, read counts, arithmetic and lists are ink the engine doesn't read: each is an error
 * that says so, at its column.
 */
import type { Op } from '@eb/core';
import type { Expr } from './ast.ts';
import { InkError } from './problems.ts';

type Token =
  | { readonly kind: 'number'; readonly value: number; readonly at: number }
  | { readonly kind: 'string'; readonly value: string; readonly at: number }
  | { readonly kind: 'word'; readonly text: string; readonly at: number }
  | { readonly kind: 'punct'; readonly text: string; readonly at: number }
  | { readonly kind: 'end'; readonly at: number };

const PUNCT = [
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '!?',
  '<',
  '>',
  '!',
  '(',
  ')',
  ',',
  '-',
  '+',
  '*',
  '/',
  '%',
  '?',
  '^',
  '=',
];
const COMPARE = new Set<string>(['==', '!=', '<', '<=', '>', '>=']);
const WORD = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/y;
const NUMBER = /[0-9]+(?:\.[0-9]+)?/y;

/** Columns count from 1. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i] as string;
    if (char === ' ' || char === '\t') {
      i++;
      continue;
    }
    const at = i + 1;
    if (char === '"') {
      const close = text.indexOf('"', i + 1);
      if (close < 0) throw new InkError('This string has no closing "', at);
      tokens.push({ kind: 'string', value: text.slice(i + 1, close), at });
      i = close + 1;
      continue;
    }
    NUMBER.lastIndex = i;
    const number = NUMBER.exec(text);
    if (number) {
      if (number[0].includes('.')) throw new InkError('Whole numbers only: the engine counts in whole numbers', at);
      tokens.push({ kind: 'number', value: Number(number[0]), at });
      i += number[0].length;
      continue;
    }
    WORD.lastIndex = i;
    const word = WORD.exec(text);
    if (word) {
      tokens.push({ kind: 'word', text: word[0], at });
      i += word[0].length;
      continue;
    }
    const punct = PUNCT.find((p) => text.startsWith(p, i));
    if (punct === undefined) throw new InkError(`"${char}" isn’t part of a condition`, at);
    tokens.push({ kind: 'punct', text: punct, at });
    i += punct.length;
  }
  tokens.push({ kind: 'end', at: text.length + 1 });
  return tokens;
}

export function parseExpr(text: string): Expr {
  const parser = new ExprParser(tokenize(text));
  const expr = parser.or();
  parser.end();
  return expr;
}

class ExprParser {
  private index = 0;
  private readonly tokens: readonly Token[];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  or(): Expr {
    let left = this.and();
    while (this.takeAny('||', 'or')) left = { kind: 'or', left, right: this.and() };
    return left;
  }

  end(): void {
    const token = this.peek();
    if (token.kind !== 'end') throw this.unexpected(token);
  }

  private and(): Expr {
    let left = this.compare();
    while (this.takeAny('&&', 'and')) left = { kind: 'and', left, right: this.compare() };
    return left;
  }

  private compare(): Expr {
    const left = this.unary();
    const token = this.peek();
    if (token.kind !== 'punct' || !COMPARE.has(token.text)) return left;
    this.index++;
    return { kind: 'compare', op: token.text as Op, left, right: this.unary(), column: token.at };
  }

  private unary(): Expr {
    if (this.takeAny('!', 'not')) return { kind: 'not', of: this.unary() };
    const token = this.next();
    if (token.kind === 'punct' && token.text === '-') {
      const number = this.next();
      if (number.kind !== 'number') throw new InkError('Expected a number after "-"', number.at);
      return { kind: 'literal', value: -number.value, column: token.at };
    }
    if (token.kind === 'number' || token.kind === 'string')
      return { kind: 'literal', value: token.value, column: token.at };
    if (token.kind === 'punct' && token.text === '(') {
      const inner = this.or();
      this.expect(')');
      return inner;
    }
    if (token.kind !== 'word') throw this.unexpected(token);
    if (token.text === 'true' || token.text === 'false') {
      return { kind: 'literal', value: token.text === 'true', column: token.at };
    }
    if (!this.isPunct('(')) throw this.bare(token.text, token.at);
    return this.call(token.text, token.at);
  }

  private call(name: string, column: number): Expr {
    if (name.includes('.'))
      throw new InkError(`${name} isn’t an EXTERNAL: call the game’s facts by their EXTERNAL`, column);
    if (name === 'RANDOM' || name === 'SEED_RANDOM') {
      throw new InkError(`${name} isn’t read: roll with an option’s outcomes, which the sim rolls and saves`, column);
    }
    this.expect('(');
    const args: Expr[] = [];
    if (!this.isPunct(')')) {
      do args.push(this.or());
      while (this.takeAny(','));
    }
    this.expect(')');
    return { kind: 'call', name, args, column };
  }

  private bare(name: string, column: number): InkError {
    return new InkError(
      `${name} is an ink variable or read count, which the engine doesn’t read: name a fact of the game through an EXTERNAL`,
      column,
    );
  }

  private unexpected(token: Token): InkError {
    if (token.kind === 'end') return new InkError('The condition ends too soon', token.at);
    if (token.kind === 'punct' && ['+', '-', '*', '/', '%'].includes(token.text)) {
      return new InkError('Arithmetic isn’t read: compare a fact with a number', token.at);
    }
    if (token.kind === 'punct' && ['?', '!?', '^'].includes(token.text)) {
      return new InkError('ink’s lists aren’t read: name a fact of the game through an EXTERNAL', token.at);
    }
    if (token.kind === 'punct' && token.text === '=')
      return new InkError('Compare with "==": "=" sets a variable', token.at);
    const shown = token.kind === 'word' || token.kind === 'punct' ? token.text : String(token.value);
    return new InkError(`"${shown}" isn’t expected here`, token.at);
  }

  private peek(): Token {
    return this.tokens[this.index] as Token;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'end') this.index++;
    return token;
  }

  private isPunct(text: string): boolean {
    const token = this.peek();
    return token.kind === 'punct' && token.text === text;
  }

  private takeAny(...texts: string[]): boolean {
    const token = this.peek();
    const text = token.kind === 'punct' || token.kind === 'word' ? token.text : undefined;
    if (text === undefined || !texts.includes(text)) return false;
    this.index++;
    return true;
  }

  private expect(text: string): void {
    if (!this.takeAny(text)) {
      const token = this.peek();
      throw new InkError(
        token.kind === 'end' ? `Expected "${text}", but the condition ended` : `Expected "${text}"`,
        token.at,
      );
    }
  }
}
