/**
 * Which screens are on show (docs/specs/screens.md#the-stack): one for each of the game's modes,
 * bottom to top, then those a button opened. A mode no screen shows gets the fallback. Only the
 * top screen, and those under it down to the first that isn't modal, are drawn.
 */
import type { Screen } from '../format/screen.ts';

export type Shown =
  | { readonly kind: 'screen'; readonly id: string; readonly screen: Screen }
  /** A mode no screen shows: the actions on offer, as a plain list. */
  | { readonly kind: 'fallback'; readonly mode: string };

// UTF-16 order, the same in every locale.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The screen for a mode: the first, in id order, whose `shows` names it. */
export function screenFor(screens: Readonly<Record<string, Screen>>, mode: string): string | undefined {
  return Object.keys(screens)
    .sort(byText)
    .find((id) => screens[id]?.shows?.includes(mode));
}

/** The stack, bottom to top. A mode that comes twice in a row shows its screen once. */
export function screenStack(
  screens: Readonly<Record<string, Screen>>,
  modes: readonly string[],
  opened: readonly string[],
): Shown[] {
  const stack: Shown[] = [];
  for (const mode of modes) {
    const id = screenFor(screens, mode);
    const shown: Shown =
      id === undefined ? { kind: 'fallback', mode } : { kind: 'screen', id, screen: screens[id] as Screen };
    const below = stack.at(-1);
    if (below && sameAs(below, shown)) continue;
    stack.push(shown);
  }
  for (const id of opened) {
    const screen = screens[id];
    if (screen !== undefined) stack.push({ kind: 'screen', id, screen });
  }
  return stack;
}

/** Screens a button opened, kept with the modes they were opened in. */
export interface Opened {
  readonly modes: readonly string[];
  readonly ids: readonly string[];
}

/** The screens still open: a step that changed the modes closed them all. */
export const stillOpen = (opened: Opened, modes: readonly string[]): readonly string[] =>
  opened.modes.length === modes.length && opened.modes.every((mode, i) => mode === modes[i]) ? opened.ids : [];

const sameAs = (a: Shown, b: Shown) =>
  a.kind === 'screen' && b.kind === 'screen'
    ? a.id === b.id
    : a.kind === 'fallback' && b.kind === 'fallback' && a.mode === b.mode;

const isModal = (shown: Shown) => shown.kind === 'screen' && shown.screen.modal === true;

/** The part of the stack that is drawn: the top, and under it down to the first screen that isn't modal. */
export function drawn(stack: readonly Shown[]): readonly Shown[] {
  let from = stack.length - 1;
  while (from > 0 && isModal(stack[from] as Shown)) from--;
  return stack.slice(Math.max(from, 0));
}
