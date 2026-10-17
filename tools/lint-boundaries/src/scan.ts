/**
 * A small tokenizer for the boundary rules. It blanks what the rules must not read and keeps
 * every line number intact.
 *
 * - `code`: comments, string contents, template text and regex bodies become spaces, so
 *   `"Date"` in a message or `Math.random` in a comment is not a violation, while code inside
 *   `${...}` is still checked.
 * - `imports`: every module specifier, with its line.
 *
 * Stripping comments with a regex (as chooser-of-the-dead's lint does) reads the `//` in
 * `'http://x'` as a comment and hides the rest of that line from every rule. Walking the
 * source token by token avoids that.
 */
export interface Scanned {
  code: string;
  imports: { spec: string; line: number }[];
}

// A `/` after one of these starts a regex literal; after anything else (a name, a number,
// `)` or `]`) it divides.
const REGEX_AFTER_PUNCT = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const REGEX_AFTER_WORD = new Set([
  'return',
  'typeof',
  'case',
  'do',
  'else',
  'in',
  'of',
  'void',
  'yield',
  'await',
  'delete',
  'throw',
  'new',
  'instanceof',
]);

export function scan(source: string): Scanned {
  const out: string[] = [];
  const imports: Scanned['imports'] = [];
  const templateDepths: number[] = []; // brace depth at each open `${`, innermost last
  let depth = 0;
  let line = 1;
  let prev = ''; // last significant token: a punctuator, a word, or 'value'
  let prevPrev = '';
  let i = 0;

  const emit = (n: number, keep: boolean): void => {
    for (let k = 0; k < n && i < source.length; k++) {
      const ch = source[i] as string;
      if (ch === '\n') line++;
      out.push(keep || ch === '\n' ? ch : ' ');
      i++;
    }
  };
  const significant = (token: string): void => {
    prevPrev = prev;
    prev = token;
  };

  const quoted = (quote: string): string => {
    let value = '';
    emit(1, true);
    while (i < source.length && source[i] !== quote && source[i] !== '\n') {
      const n = source[i] === '\\' ? 2 : 1;
      value += source.slice(i, i + n);
      emit(n, false);
    }
    if (source[i] === quote) emit(1, true);
    return value;
  };

  const templateText = (): void => {
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') {
        emit(2, false);
      } else if (ch === '`') {
        emit(1, true);
        significant('value');
        return;
      } else if (ch === '$' && source[i + 1] === '{') {
        emit(2, true);
        templateDepths.push(depth);
        depth++;
        significant('{');
        return;
      } else {
        emit(1, false);
      }
    }
  };

  const regexBody = (): void => {
    emit(1, true);
    let inClass = false;
    while (i < source.length && source[i] !== '\n') {
      const ch = source[i];
      if (ch === '\\') emit(2, false);
      else if (ch === '/' && !inClass) break;
      else {
        if (ch === '[') inClass = true;
        if (ch === ']') inClass = false;
        emit(1, false);
      }
    }
    if (source[i] === '/') emit(1, true);
    while (/[a-z]/.test(source[i] ?? '')) emit(1, true); // flags
    significant('value');
  };

  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];

    if (/\s/.test(ch)) {
      emit(1, true);
    } else if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') emit(1, false);
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      emit((end === -1 ? source.length : end + 2) - i, false);
    } else if (ch === "'" || ch === '"') {
      const isImport = prev === 'from' || prev === 'import' || (prev === '(' && prevPrev === 'import');
      const startLine = line;
      const spec = quoted(ch);
      if (isImport) imports.push({ spec, line: startLine });
      significant('value');
    } else if (ch === '`') {
      emit(1, true);
      templateText();
    } else if (ch === '}' && templateDepths.length > 0 && depth - 1 === templateDepths[templateDepths.length - 1]) {
      templateDepths.pop();
      depth--;
      emit(1, true);
      templateText();
    } else if (ch === '/' && (prev === '' || REGEX_AFTER_PUNCT.has(prev) || REGEX_AFTER_WORD.has(prev))) {
      regexBody();
    } else if (/[A-Za-z_$]/.test(ch)) {
      const word = /^[\w$]+/.exec(source.slice(i, i + 64))?.[0] ?? ch;
      emit(word.length, true);
      significant(word);
    } else if (/\d/.test(ch)) {
      const num = /^[\w.]+/.exec(source.slice(i, i + 64))?.[0] ?? ch;
      emit(num.length, true);
      significant('value');
    } else {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      emit(1, true);
      significant(ch);
    }
  }
  return { code: out.join(''), imports };
}
