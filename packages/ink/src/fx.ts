/**
 * An effect written in a tag (docs/specs/ink.md#effects): its name, then its fields in brackets as
 * a condition names a fact's arguments, `# fx: change-standing(faction: hel, by: 3)`. A value is a
 * whole number, true or false, a word, text in double quotes, `(key: value, …)` or `[value, …]`.
 * The effect itself is checked as any record's effects are, against the game's schemas.
 */
import { InkError } from './problems.ts';

const NAME = /[a-z][a-z0-9]*(?:-[a-z0-9]+)*/y;
const KEY = /[A-Za-z0-9_-]+/y;
const WORD = /[A-Za-z0-9_.-]+/y;
const INT = /^[+-]?[0-9]+$/;

/** Columns count from 1, within `text`. */
export function parseEffect(text: string): Record<string, unknown> {
  const reader = new Reader(text);
  reader.space();
  const name = reader.match(NAME);
  if (name === undefined) throw new InkError('An effect starts with its name, like give-item', reader.column());
  const effect: Record<string, unknown> = { effect: name };
  reader.space();
  if (reader.take('(')) {
    const fields = reader.fields(')');
    if ('effect' in fields) throw new InkError('"effect" is the effect’s name, not a field', reader.column());
    Object.assign(effect, fields);
  }
  reader.space();
  if (!reader.done()) throw new InkError('Expected the end of the effect, or its fields in brackets', reader.column());
  return effect;
}

class Reader {
  private at = 0;
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  column(): number {
    return this.at + 1;
  }

  done(): boolean {
    return this.at >= this.text.length;
  }

  space(): void {
    while (this.text[this.at] === ' ' || this.text[this.at] === '\t') this.at++;
  }

  take(char: string): boolean {
    if (this.text[this.at] !== char) return false;
    this.at++;
    return true;
  }

  match(pattern: RegExp): string | undefined {
    pattern.lastIndex = this.at;
    const found = pattern.exec(this.text);
    if (!found) return undefined;
    this.at += found[0].length;
    return found[0];
  }

  /** `key: value, …` up to `close`, which is taken. */
  fields(close: string): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    this.space();
    if (this.take(close)) return fields;
    do {
      this.space();
      const column = this.column();
      const key = this.match(KEY);
      if (key === undefined) throw new InkError('Expected a field’s name', column);
      if (Object.hasOwn(fields, key)) throw new InkError(`"${key}" is given twice`, column);
      this.space();
      if (!this.take(':')) throw new InkError(`Expected ":" after "${key}"`, this.column());
      fields[key] = this.value();
      this.space();
    } while (this.take(','));
    if (!this.take(close)) throw new InkError(`Expected "," or "${close}"`, this.column());
    return fields;
  }

  value(): unknown {
    this.space();
    const column = this.column();
    if (this.take('(')) return this.fields(')');
    if (this.take('[')) return this.list();
    if (this.take('"')) return this.quoted(column);
    const word = this.match(WORD);
    if (word === undefined) throw new InkError('Expected a value', column);
    if (INT.test(word)) return Number(word);
    if (word === 'true' || word === 'false') return word === 'true';
    return word;
  }

  private list(): unknown[] {
    const items: unknown[] = [];
    this.space();
    if (this.take(']')) return items;
    do {
      items.push(this.value());
      this.space();
    } while (this.take(','));
    if (!this.take(']')) throw new InkError('Expected "," or "]"', this.column());
    return items;
  }

  private quoted(column: number): string {
    let end = this.at;
    while (end < this.text.length && this.text[end] !== '"') end += this.text[end] === '\\' ? 2 : 1;
    if (end >= this.text.length) throw new InkError('This text has no closing "', column);
    const raw = this.text.slice(this.at - 1, end + 1);
    this.at = end + 1;
    try {
      return JSON.parse(raw) as string;
    } catch {
      throw new InkError('This text’s backslashes aren’t JSON’s', column);
    }
  }
}
