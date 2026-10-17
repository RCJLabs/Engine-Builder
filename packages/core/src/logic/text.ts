/**
 * A condition's text form, both ways (docs/specs/conditions.md):
 *
 *   hold.count(medkit) >= 2 and not voyage.night
 *
 * `or` binds loosest, then `and`, then `not`, then a comparison. A chain of one word is one node,
 * and parentheses keep a group as its own node, so every tree prints one way and reads back as
 * itself. With a catalog, a fact with exactly one argument reads and prints that argument without
 * its name.
 */

import { ConditionSyntaxError, type Token, tokenize } from './lexer.ts';
import type { Condition, FactCatalog, FactTest, Op, Value } from './types.ts';
import { NAME_PATTERN } from './values.ts';

const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false']);

export type ParseResult =
  | { readonly ok: true; readonly condition: Condition }
  | { readonly ok: false; readonly message: string; readonly at: number };

export function parseCondition(text: string, catalog?: FactCatalog): ParseResult {
  try {
    const parser = new Parser(tokenize(text), catalog);
    const condition = parser.or();
    parser.expectEnd();
    return { ok: true, condition };
  } catch (error) {
    if (error instanceof ConditionSyntaxError) return { ok: false, message: error.message, at: error.at };
    throw error;
  }
}

class Parser {
  private readonly tokens: readonly Token[];
  private readonly catalog: FactCatalog | undefined;
  private index = 0;

  constructor(tokens: readonly Token[], catalog: FactCatalog | undefined) {
    this.tokens = tokens;
    this.catalog = catalog;
  }

  or(): Condition {
    const first = this.and();
    if (!this.isWord('or')) return first;
    const any = [first];
    while (this.take('or')) any.push(this.and());
    return { any };
  }

  expectEnd(): void {
    const token = this.peek();
    if (token.kind !== 'end')
      throw this.error(
        token,
        this.isWord('and') || this.isWord('or') ? 'Nothing after this word' : 'Expected "and", "or" or the end',
      );
  }

  private and(): Condition {
    const first = this.not();
    if (!this.isWord('and')) return first;
    const all = [first];
    while (this.take('and')) all.push(this.not());
    return { all };
  }

  private not(): Condition {
    if (this.take('not')) return { not: this.not() };
    const token = this.peek();
    if (token.kind === 'punct' && token.text === '(') {
      this.index++;
      const inner = this.or();
      this.expectPunct(')', 'Expected ")"');
      return inner;
    }
    return this.test();
  }

  private test(): FactTest {
    const token = this.next();
    if (token.kind !== 'word' || !token.text.includes('.') || KEYWORDS.has(token.text)) {
      throw this.error(token, 'Expected a fact, like hold.count');
    }
    const fact = token.text;
    const args = this.isPunct('(') ? this.args(fact) : undefined;
    const op = this.peek();
    if (op.kind !== 'op') return args ? { fact, args } : { fact };
    this.index++;
    const value = this.value('Expected a value to compare with');
    return { fact, ...(args ? { args } : {}), op: op.text as Op, value };
  }

  private args(fact: string): Record<string, Value> {
    const open = this.next();
    const first = this.peek();
    if (first.kind === 'punct' && first.text === ')')
      throw this.error(first, 'A fact with no arguments has no brackets');
    const after = this.tokens[this.index + 1];
    if (!(first.kind === 'word' && after?.kind === 'punct' && after.text === ':')) {
      const value = this.value('Expected an argument');
      this.expectPunct(')', 'Expected ")": name each argument when there is more than one');
      const names = Object.keys(this.catalog?.[fact]?.args ?? {});
      if (names.length !== 1) throw this.error(open, `Name the argument, like ${fact}(name: …)`);
      return { [names[0] as string]: value };
    }
    const args: Record<string, Value> = {};
    do {
      const name = this.next();
      if (name.kind !== 'word' || !NAME_PATTERN.test(name.text)) throw this.error(name, 'Expected an argument name');
      if (name.text in args) throw this.error(name, `"${name.text}" is given twice`);
      this.expectPunct(':', 'Expected ":" after the argument name');
      args[name.text] = this.value('Expected the argument value');
    } while (this.takePunct(','));
    this.expectPunct(')', 'Expected "," or ")"');
    return args;
  }

  private value(problem: string): Value {
    const token = this.next();
    if (token.kind === 'number' || token.kind === 'string') return token.value;
    if (token.kind === 'word' && !token.text.includes('.')) {
      if (token.text === 'true' || token.text === 'false') return token.text === 'true';
      if (!KEYWORDS.has(token.text)) return token.text;
    }
    const dotted = token.kind === 'word' && token.text.includes('.');
    throw this.error(token, dotted ? `${problem}; text with a dot goes in quotes` : problem);
  }

  private peek(): Token {
    return this.tokens[this.index] as Token;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'end') this.index++;
    return token;
  }

  private isWord(word: string): boolean {
    const token = this.peek();
    return token.kind === 'word' && token.text === word;
  }

  private take(word: string): boolean {
    if (!this.isWord(word)) return false;
    this.index++;
    return true;
  }

  private isPunct(text: string): boolean {
    const token = this.peek();
    return token.kind === 'punct' && token.text === text;
  }

  private takePunct(text: string): boolean {
    if (!this.isPunct(text)) return false;
    this.index++;
    return true;
  }

  private expectPunct(text: string, problem: string): void {
    if (!this.takePunct(text)) throw this.error(this.peek(), problem);
  }

  private error(token: Token, problem: string): ConditionSyntaxError {
    return new ConditionSyntaxError(token.kind === 'end' ? `${problem}, but the text ended` : problem, token.at);
  }
}

/** The canonical text of a condition. Reading it back gives the same tree. */
export function printCondition(condition: Condition, catalog?: FactCatalog): string {
  if ('all' in condition) return condition.all.map((c) => grouped(c, catalog)).join(' and ');
  if ('any' in condition) return condition.any.map((c) => grouped(c, catalog)).join(' or ');
  if ('not' in condition) return `not ${grouped(condition.not, catalog)}`;
  return printTest(condition, catalog);
}

// A nested all or any always gets brackets: the same word would merge into one node, and mixed
// words read more safely with them.
const grouped = (c: Condition, catalog?: FactCatalog) =>
  'all' in c || 'any' in c ? `(${printCondition(c, catalog)})` : printCondition(c, catalog);

function printTest(test: FactTest, catalog?: FactCatalog): string {
  let text = test.fact;
  if (test.args) {
    const names = Object.keys(test.args).sort();
    const declared = Object.keys(catalog?.[test.fact]?.args ?? {});
    const positional = names.length === 1 && declared.length === 1 && declared[0] === names[0];
    text += positional
      ? `(${printValue(test.args[names[0] as string] as Value)})`
      : `(${names.map((name) => `${name}: ${printValue(test.args?.[name] as Value)}`).join(', ')})`;
  }
  return test.op === undefined ? text : `${text} ${test.op} ${printValue(test.value as Value)}`;
}

export function printValue(value: Value): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return NAME_PATTERN.test(value) && !KEYWORDS.has(value) ? value : JSON.stringify(value);
}
