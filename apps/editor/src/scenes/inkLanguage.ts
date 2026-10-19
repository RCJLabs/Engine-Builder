/**
 * ink's colours in the scene editor (M3.11): knots as headings, choices, gathers and diverts as
 * keywords, labels and divert targets as labels, conditions in braces, tags and comments. Only
 * colours: what a scene means is @eb/ink's to say, with its problems in the gutter.
 */
import { StreamLanguage, type StringStream } from '@codemirror/language';

interface InkState {
  /** Inside a block comment, which can run over lines. */
  comment: boolean;
  /** Inside `{ … }` on this line. */
  braces: number;
}

const KEYWORDS = /^(EXTERNAL|VAR|CONST|INCLUDE|LIST|END|DONE|else|not|and|or|true|false)\b/;

function lineStart(stream: StringStream): string | null {
  if (stream.match(/^==+\s*[A-Za-z_][A-Za-z0-9_]*\s*=*/)) return 'heading';
  if (stream.match(/^(\s*[*+])+/)) return 'keyword';
  if (stream.match(/^(\s*-(?!>))+/)) return 'keyword';
  return null;
}

function token(stream: StringStream, state: InkState): string | null {
  if (stream.sol()) state.braces = 0;
  if (state.comment) {
    if (stream.skipTo('*/')) {
      stream.next();
      stream.next();
      state.comment = false;
    } else stream.skipToEnd();
    return 'comment';
  }
  if (stream.match('//')) {
    stream.skipToEnd();
    return 'comment';
  }
  if (stream.match('/*')) {
    state.comment = true;
    return 'comment';
  }
  if (stream.sol()) {
    stream.eatSpace();
    const start = lineStart(stream);
    if (start) return start;
  }
  if (stream.match(/^\([A-Za-z_][A-Za-z0-9_]*\)/)) return 'labelName';
  if (stream.match('->')) {
    stream.eatSpace();
    stream.match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    return 'keyword';
  }
  if (stream.peek() === '#') {
    stream.next();
    while (!stream.eol() && stream.peek() !== '#' && stream.peek() !== ']') stream.next();
    return 'meta';
  }
  if (stream.peek() === '{') {
    stream.next();
    state.braces++;
    return 'bracket';
  }
  if (stream.peek() === '}') {
    stream.next();
    state.braces = Math.max(0, state.braces - 1);
    return 'bracket';
  }
  if (stream.match(KEYWORDS)) return 'keyword';
  if (state.braces > 0 || stream.string.trimStart().startsWith('EXTERNAL')) {
    if (stream.match(/^"[^"]*"/)) return 'string';
    if (stream.match(/^-?[0-9]+/)) return 'number';
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*(?=\s*\()/)) return 'propertyName';
  }
  stream.next();
  return null;
}

export const ink = StreamLanguage.define<InkState>({
  name: 'ink',
  startState: () => ({ comment: false, braces: 0 }),
  token,
  languageData: { commentTokens: { line: '//', block: { open: '/*', close: '*/' } } },
});
