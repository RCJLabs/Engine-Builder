/**
 * Where a game's screens, theme, feedback and shell sit, and what each file under ui/ is (M4.1, D51; M4.2; M4.3): apart from
 * ui.ts, which checks them, so the editor can list screens as a project opens without loading
 * the checks with it, as sceneFiles.ts does for scenes.
 */
import { isRecordId } from '@eb/core';

export const UI_DIR = 'ui';
export const THEME_FILE = `${UI_DIR}/theme.json`;
export const FEEDBACK_FILE = `${UI_DIR}/feedback.json`;
export const SHELL_FILE = `${UI_DIR}/shell.json`;
export const screenPath = (id: string) => `${UI_DIR}/${id}.json`;

export type UiFileRole =
  | { readonly kind: 'screen'; readonly id: string }
  | { readonly kind: 'theme' }
  | { readonly kind: 'feedback' }
  | { readonly kind: 'shell' }
  | { readonly kind: 'ignored'; readonly reason: string };

/** What a file under ui/ is: ui/theme.json, ui/feedback.json, ui/shell.json, a screen named as a record is, or none of them. */
export function classifyUi(path: string): UiFileRole {
  if (path === THEME_FILE) return { kind: 'theme' };
  if (path === FEEDBACK_FILE) return { kind: 'feedback' };
  if (path === SHELL_FILE) return { kind: 'shell' };
  const parts = path.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (!name.endsWith('.json')) return { kind: 'ignored', reason: 'Ignored: screens are ui/<id>.json' };
  if (parts.length !== 2 || parts[0] !== UI_DIR) {
    return { kind: 'ignored', reason: 'Ignored: a screen sits at ui/<id>.json, not in a folder of its own' };
  }
  const id = name.slice(0, -'.json'.length);
  if (!isRecordId(id)) {
    return {
      kind: 'ignored',
      reason: `Ignored: "${id}" isn’t a screen’s name, which is lowercase words joined by hyphens`,
    };
  }
  return { kind: 'screen', id };
}
