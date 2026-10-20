/**
 * A game's screens as the compiler reads them (M4.1, D51, docs/specs/screens.md): every file under
 * ui/ placed, each screen, the theme and the feedback (M4.2) read as JSON. Checking them needs the
 * game's facts, actions, modes and events, which compileProject has; reading them doesn't.
 */
import type { PackUi } from '@eb/core';
import {
  checkUi,
  type Diagnostic,
  type DiagnosticCode,
  severityOf,
  type UiCheckOptions,
  type UiFile,
} from '@eb/schema';
import { parseJsonFile } from './decode.ts';
import { placeOfPointer } from './jsonLines.ts';
import type { ProjectSource } from './source.ts';
import { classifyUi, UI_DIR } from './uiFiles.ts';

export interface UiRead {
  /** Every screen by id, unreadable when it isn't JSON. */
  readonly screens: ReadonlyMap<string, UiFile>;
  readonly theme: UiFile | undefined;
  /** ui/feedback.json (M4.2). */
  readonly feedback: UiFile | undefined;
  /** E007 and W132, in no order. */
  readonly diagnostics: readonly Diagnostic[];
  /** Each file's text, for the lines its problems are at. */
  readonly texts: ReadonlyMap<string, string>;
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
  let feedback: UiFile | undefined;
  const texts = new Map<string, string>();
  for (const file of [...(await source.files(UI_DIR))].sort(byText)) {
    const role = classifyUi(file);
    if (role.kind === 'ignored') {
      diagnostics.push(diagnostic(file, 'W132', role.reason));
      continue;
    }
    const bytes = await source.read(file);
    const parsed = bytes === undefined ? ({ ok: false, message: 'Missing file' } as const) : parseJsonFile(bytes);
    if (parsed.ok && bytes) texts.set(file, new TextDecoder().decode(bytes));
    if (!parsed.ok) diagnostics.push(diagnostic(file, 'E007', parsed.message));
    const read: UiFile = parsed.ok ? { file, value: parsed.value } : { file, value: undefined, unreadable: true };
    if (role.kind === 'theme') theme = read;
    else if (role.kind === 'feedback') feedback = read;
    else screens.set(role.id, read);
  }
  return { screens, theme, feedback, diagnostics, texts };
}

/**
 * The screens and theme checked against the game (checkUi), each problem at its line and column
 * in its file as well as its JSON path, so the editor's screen editor and `eb validate` place it
 * as a scene's problems are placed. The editor's checks call this too.
 */
export function checkProjectUi(ui: UiRead, options: UiCheckOptions): Diagnostic[] {
  return checkUi(ui.screens, ui.theme, options, ui.feedback).map((d) => {
    const text = d.file === undefined ? undefined : ui.texts.get(d.file);
    const at = text === undefined ? undefined : placeOfPointer(text, d.path);
    return at ? { ...d, ...at } : d;
  });
}

/**
 * What the pack carries: the screens by id, the theme, and the feedback once it has a line. Only
 * once they are checked. They are in id order already, read from files in that order, and the
 * pack's hash sorts keys besides.
 */
export function packUi(ui: UiRead): PackUi | undefined {
  // Feedback with no lines says nothing, so it leaves the pack in the format it would have had.
  const feedback = (ui.feedback?.value as { lines?: readonly unknown[] } | undefined)?.lines?.length
    ? ui.feedback?.value
    : undefined;
  if (ui.screens.size === 0 && feedback === undefined) return undefined;
  const screens = Object.fromEntries([...ui.screens].map(([id, { value }]) => [id, value]));
  return {
    screens,
    ...(ui.theme !== undefined ? { theme: ui.theme.value } : {}),
    ...(feedback !== undefined ? { feedback } : {}),
  };
}
