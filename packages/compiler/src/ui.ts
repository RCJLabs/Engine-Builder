/**
 * A game's screens as the compiler reads them (M4.1, D51, docs/specs/screens.md): every file under
 * ui/ placed, each screen and the theme read as JSON. Checking them needs the game's facts,
 * actions and modes, which compileProject has; reading them doesn't.
 */
import type { PackUi } from '@eb/core';
import { type Diagnostic, type DiagnosticCode, severityOf, type UiFile } from '@eb/schema';
import { parseJsonFile } from './decode.ts';
import type { ProjectSource } from './source.ts';
import { classifyUi, UI_DIR } from './uiFiles.ts';

export interface UiRead {
  /** Every screen by id, unreadable when it isn't JSON. */
  readonly screens: ReadonlyMap<string, UiFile>;
  readonly theme: UiFile | undefined;
  /** E007 and W132, in no order. */
  readonly diagnostics: readonly Diagnostic[];
}

// UTF-16 order, the same in every locale.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const diagnostic = (file: string, code: DiagnosticCode, message: string): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  file,
  path: '',
});

export async function readUi(source: ProjectSource): Promise<UiRead> {
  const diagnostics: Diagnostic[] = [];
  const screens = new Map<string, UiFile>();
  let theme: UiFile | undefined;
  for (const file of [...(await source.files(UI_DIR))].sort(byText)) {
    const role = classifyUi(file);
    if (role.kind === 'ignored') {
      diagnostics.push(diagnostic(file, 'W132', role.reason));
      continue;
    }
    const bytes = await source.read(file);
    const parsed = bytes === undefined ? ({ ok: false, message: 'Missing file' } as const) : parseJsonFile(bytes);
    if (!parsed.ok) diagnostics.push(diagnostic(file, 'E007', parsed.message));
    const read: UiFile = parsed.ok ? { file, value: parsed.value } : { file, value: undefined, unreadable: true };
    if (role.kind === 'theme') theme = read;
    else screens.set(role.id, read);
  }
  return { screens, theme, diagnostics };
}

/** What the pack carries: the screens by id, sorted, and the theme. Only once they are checked. */
export function packUi(ui: UiRead): PackUi | undefined {
  if (ui.screens.size === 0) return undefined;
  const ids = [...ui.screens.keys()].sort(byText);
  const screens = Object.fromEntries(ids.map((id) => [id, (ui.screens.get(id) as UiFile).value]));
  return { screens, ...(ui.theme !== undefined ? { theme: ui.theme.value } : {}) };
}
