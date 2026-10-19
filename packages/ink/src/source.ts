/**
 * A scene's lines with ink's comments taken out, as ink's own CommentEliminator does before it
 * parses: `//` to the end of the line, and `/* … *\/` across lines, each character of a comment
 * made a space so every column stays where it was written.
 */

export interface SourceLine {
  /** Counted from 1. */
  readonly number: number;
  readonly text: string;
}

export function sourceLines(source: string): SourceLine[] {
  const text = source.replace(/\r\n?/g, '\n');
  let out = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i] as string;
    if (char === '\\' && i + 1 < text.length) {
      out += text.slice(i, i + 2);
      i += 2;
    } else if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? text.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += char;
      i++;
    }
  }
  return out.split('\n').map((line, index) => ({ number: index + 1, text: line.replace(/\s+$/, '') }));
}

/** The index of `close` in `text` from `from`, outside double quotes, or -1. A `{` before it is reported by its caller. */
export function closing(text: string, from: number, close: string): number {
  let quoted = false;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (char === '\\' && !quoted) i++;
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === close) return i;
  }
  return -1;
}

/** The first `:` outside double quotes and brackets, or -1: where a condition ends and what it shows starts. */
export function topColon(text: string): number {
  let quoted = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ':' && depth === 0) return i;
  }
  return -1;
}
