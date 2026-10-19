/**
 * JSON's colours in the screen editor (M4.1): keys, strings, numbers, and true, false and null.
 * Only colours: what a screen means is the compiler's to say, with its problems in the gutter.
 */
import { StreamLanguage, type StringStream } from '@codemirror/language';

function token(stream: StringStream): string | null {
  if (stream.eatSpace()) return null;
  if (stream.peek() === '"') {
    stream.next();
    let escaped = false;
    while (!stream.eol()) {
      const char = stream.next();
      if (char === '"' && !escaped) break;
      escaped = char === '\\' && !escaped;
    }
    // A string followed by a colon is a key.
    return stream.match(/^\s*:/, false) ? 'propertyName' : 'string';
  }
  if (stream.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/)) return 'number';
  if (stream.match(/^(true|false)\b/)) return 'bool';
  if (stream.match(/^null\b/)) return 'null';
  stream.next();
  return null;
}

export const json = StreamLanguage.define<Record<string, never>>({
  name: 'json',
  startState: () => ({}),
  token,
});
