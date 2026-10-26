/**
 * The screens' warnings, which look across screens rather than into one (docs/specs/screens.md and
 * input.md): a mode no screen shows (W133, M4.1) and a screen only a button opens with nothing on it
 * that closes it (W134, M4.2).
 */
import { childrenOf, REGIONS, type Screen, type Widget } from '@eb/ui/format';
import type { Diagnostic } from './diagnostics.ts';
import type { UiFile } from './uiCheck.ts';

/**
 * W133: a mode the game has that no screen shows, so it plays with the fallback. A screen with
 * problems of its own still counts for the modes it names, so its E047 isn't joined by a W133. The
 * fighting kit's fallen mode is the shell's to draw (M6.4): its Fallen screen covers the game's.
 */
const SHELL_DRAWN = ['fallen'];

export function unshownModes(screens: ReadonlyMap<string, UiFile>, modes: readonly string[], out: Diagnostic[]): void {
  const shows = ({ value }: UiFile) => {
    const named = typeof value === 'object' && value !== null ? (value as { shows?: unknown }).shows : undefined;
    return Array.isArray(named) ? named.filter((mode): mode is string => typeof mode === 'string') : [];
  };
  const shown = new Set([...[...screens.values()].flatMap(shows), ...SHELL_DRAWN]);
  for (const mode of modes) {
    if (shown.has(mode)) continue;
    out.push({
      code: 'W133',
      severity: 'warning',
      message: `No screen shows the mode "${mode}": it plays with the fallback, a list of the actions on offer`,
      path: '',
    });
  }
}

const closes = (widget: Widget): boolean =>
  (widget.widget === 'button' && 'close' in widget.action) || childrenOf(widget).some(closes);

/**
 * W134: a screen no mode shows, so only a button opens it, with no button of its own that closes
 * it. Escape and a pad's B still would, but on touch only a swipe right, which nothing on the
 * screen tells the player about.
 */
export function unclosable(screen: Screen, file: string, out: Diagnostic[]): void {
  if ((screen.shows ?? []).length > 0) return;
  if (REGIONS.some((region) => screen[region] !== undefined && closes(screen[region] as Widget))) return;
  out.push({
    code: 'W134',
    severity: 'warning',
    message:
      'Only a button opens this screen and nothing on it closes it: add a button whose action is { "close": true }',
    file,
    path: '',
  });
}
