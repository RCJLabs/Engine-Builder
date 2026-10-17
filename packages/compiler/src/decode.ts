export type ParsedFile =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

// fatal: bad bytes are an error, not a silent U+FFFD in someone's text. A leading byte order
// mark, which some Windows editors write, is dropped, as TextDecoder does by default.
const utf8 = new TextDecoder('utf-8', { fatal: true });

/** A JSON file's value, or why it has none. */
export function parseJsonFile(bytes: Uint8Array): ParsedFile {
  let text: string;
  try {
    text = utf8.decode(bytes);
  } catch {
    return { ok: false, message: 'Not valid UTF-8' };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    // The engine's own wording; it varies between browsers, which is why messages are not part of the contract.
    return { ok: false, message: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}
