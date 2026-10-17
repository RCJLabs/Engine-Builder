/**
 * A JSON file rewritten after an edit in the layout it was written in, so that git shows only
 * the lines that changed: its byte order mark, line ends, indentation and last newline stay.
 * Numbers and the order of keys come out as JSON.stringify writes them.
 */

// Built from its code: a formatter may turn the escape into an invisible character.
const BOM = String.fromCharCode(0xfeff);
// fatal: bad bytes are an error, never a silent U+FFFD written back; ignoreBOM keeps the mark in the text.
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export interface JsonLayout {
  readonly bom: boolean;
  readonly eol: '\n' | '\r\n';
  /** One level of indentation: spaces or a tab, or '' for a file written on one line. */
  readonly indent: string;
  readonly finalNewline: boolean;
}

/** The layout a person or tool wrote the file in. The first indented line sets the indent. */
export function layoutOf(text: string): JsonLayout {
  return {
    bom: text.startsWith(BOM),
    eol: text.includes('\r\n') ? '\r\n' : '\n',
    indent: /\n([ \t]+)\S/.exec(text)?.[1] ?? '',
    finalNewline: text.endsWith('\n'),
  };
}

export function writeJson(value: unknown, layout: JsonLayout): string {
  // JSON.stringify escapes newlines inside strings, so every newline it writes is the layout's own.
  const body = JSON.stringify(value, null, layout.indent).replaceAll('\n', layout.eol);
  return `${layout.bom ? BOM : ''}${body}${layout.finalNewline ? layout.eol : ''}`;
}

export function readJson(bytes: Uint8Array): { value: unknown; layout: JsonLayout } {
  const text = utf8.decode(bytes);
  const layout = layoutOf(text);
  return { value: JSON.parse(layout.bom ? text.slice(1) : text) as unknown, layout };
}

/**
 * The file's bytes after `change`, in its own layout. A change that leaves the value as it was
 * gives back the same bytes, so an edit typed back to the start leaves the file untouched.
 */
export function editJson(bytes: Uint8Array, change: (value: unknown) => unknown): Uint8Array {
  const { value, layout } = readJson(bytes);
  // Taken first: `change` may edit the value in place.
  const was = JSON.stringify(value);
  const next = change(value);
  if (JSON.stringify(next) === was) return bytes;
  return new TextEncoder().encode(writeJson(next, layout));
}
