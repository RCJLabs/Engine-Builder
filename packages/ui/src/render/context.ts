/**
 * What every widget draws from: the view, the breakpoint, and how to act. Passed down as a prop
 * rather than through Preact's context, so a widget is a plain function of what it is given.
 */
import type { Action } from '@eb/core';
import type { Breakpoint, ShellGo } from '../format/screen.ts';
import type { View } from '../session/types.ts';
import type { LogLine } from './feedback.ts';

export interface Drawing {
  readonly view: View;
  readonly breakpoint: Breakpoint;
  /** A step is on its way: every button waits for its view. */
  readonly busy: boolean;
  act(action: Action): void;
  open(screen: string): void;
  /** Closes the top screen a button opened; undefined when none is open. */
  readonly close: (() => void) | undefined;
  /** An asset's URL, for images. Without one, an image shows its alt text. */
  assetUrl(path: string): string | undefined;
  /** The play's log, newest last, for log widgets (M4.2). */
  readonly log: readonly LogLine[];
  /** The shell's pause is over the game (M4.3): nothing in it takes focus until it goes. */
  readonly paused?: boolean;
  /** Back to the play shell's title or New game (M4.4); undefined where no shell plays the game. */
  readonly toShell?: ((go: ShellGo) => void) | undefined;
}

let next = 0;
/**
 * An id no other element of the page has. Not Preact's useId: the editor's dock renders panels in
 * roots of their own, whose ids would repeat (the editor's ids.ts).
 */
export const freshId = (prefix: string) => `eb-ui-${prefix}-${++next}`;
