/**
 * Tokens of a condition's text form: `hold.count(medkit) >= 2 and not voyage.night`.
 * Errors give a 0-based column and, for habits from other languages, the word to use instead
 * (as who-am-i-'s src/engine/cond/parse.ts does).
 */
export type Token =
  | { readonly kind: 'word'; readonly text: string; readonly at: number }
  | { readonly kind: 'number'; readonly value: number; readonly at: number }
  | { readonly kind: 'string'; readonly value: string; readonly at: number }
  | { readonly kind: 'op'; readonly text: string; readonly at: number }
  | { readonly kind: 'punct'; readonly text: '(' | ')' | ',' | ':'; readonly at: number }
  | { readonly kind: 'end'; readonly at: number };

export class ConditionSyntaxError extends Error {
  /** 0-based column in the text. */
  readonly at: number;
  constructor(message: string, at: number) {
    super(`${message} (column ${at + 1})`);
    this.name = 'ConditionSyntaxError';
    this.at = at;
  }
}

const WORD = /[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?/y;
const NUMBER = /-?\d+(?:\.\d+)?(?![\w.])/y;
// biome-ignore lint/suspicious/noControlCharactersInRegex: a JSON string may not hold U+0000 to U+001F raw (RFC 8259).
const STRING = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
const OP = /==|!=|<=|>=|<|>/y;
// A quest's slot (M3.10): text, as a quoted "@mark" is, written bare.
const SLOT = /@[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?![\w-])/y;
const SPACE = /\s+/y;

const HINTS: readonly [RegExp, string][] = [
  [/@/y, 'a slot is @ and its name, like @mark'],
  [/&&?/y, 'write "and"'],
  [/\|\|?/y, 'write "or"'],
  [/!/y, 'write "not"'],
  [/=/y, 'compare with "=="'],
  [/'/y, 'text goes in double quotes'],
  [/[A-Z]/y, 'names are lowercase, like hold.count'],
  [/\d[\w.]*/y, 'numbers have no exponent or letters; quote text that starts with a digit'],
];

function match(pattern: RegExp, text: string, at: number): string | undefined {
  pattern.lastIndex = at;
  return pattern.exec(text)?.[0];
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const space = match(SPACE, text, at);
    if (space) {
      at += space.length;
      continue;
    }
    const token = readToken(text, at);
    tokens.push(token.token);
    at += token.length;
  }
  tokens.push({ kind: 'end', at: text.length });
  return tokens;
}

function readToken(text: string, at: number): { token: Token; length: number } {
  const char = text[at] as string;
  if ('(),:'.includes(char)) return { token: { kind: 'punct', text: char as '(' | ')' | ',' | ':', at }, length: 1 };
  const op = match(OP, text, at);
  if (op) return { token: { kind: 'op', text: op, at }, length: op.length };
  const number = match(NUMBER, text, at);
  if (number) return { token: { kind: 'number', value: Number(number), at }, length: number.length };
  const word = match(WORD, text, at);
  if (word) return { token: { kind: 'word', text: word, at }, length: word.length };
  const slot = match(SLOT, text, at);
  if (slot) return { token: { kind: 'string', value: slot, at }, length: slot.length };
  const string = match(STRING, text, at);
  if (string) return { token: { kind: 'string', value: JSON.parse(string) as string, at }, length: string.length };
  for (const [pattern, hint] of HINTS) {
    if (match(pattern, text, at)) throw new ConditionSyntaxError(`Unexpected "${char}": ${hint}`, at);
  }
  throw new ConditionSyntaxError(char === '"' ? 'Text that never ends' : `Unexpected "${char}"`, at);
}
