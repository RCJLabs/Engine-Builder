/**
 * TypeScript to JavaScript by sucrase (ROADMAP M3.2): types stripped and imports turned into
 * require calls the loader answers. Sucrase keeps every line where it was, so a line in an error
 * from the JavaScript is the same line of the TypeScript, with no source map.
 */
import { transform } from 'sucrase';

export type Transpiled =
  | { readonly ok: true; readonly js: string }
  | { readonly ok: false; readonly message: string; readonly line?: number; readonly column?: number };

export function transpileScript(source: string): Transpiled {
  try {
    const { code } = transform(source, { transforms: ['typescript', 'imports'], disableESTransforms: true });
    return { ok: true, js: code };
  } catch (error) {
    // Sucrase puts the place in the message too ("Unexpected token (1:11)"): said once, as line and column.
    const message = error instanceof Error ? error.message.replace(/ \(\d+:\d+\)$/, '') : String(error);
    const loc = (error as { loc?: { line?: unknown; column?: unknown } }).loc;
    const line = typeof loc?.line === 'number' ? loc.line : undefined;
    // Sucrase counts columns from 1, as an editor shows them.
    const column = typeof loc?.column === 'number' ? loc.column : undefined;
    return {
      ok: false,
      message,
      ...(line !== undefined ? { line } : {}),
      ...(column !== undefined ? { column } : {}),
    };
  }
}
