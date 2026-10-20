/**
 * What the shell is given (M4.3, D53): the open game as the worker described it, a way to send it
 * requests, and where its saves and settings are kept. The player page and the Play panel each make
 * these their own way.
 */
import type { Store } from '@eb/platform';
import type { PlayReply, PlayRequest } from '../session/protocol.ts';

/** A request as the page sends it: its client numbers it. */
export type ShellRequest = PlayRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

export type OpenedGame = Extract<PlayReply, { kind: 'opened' }>;

export interface ShellProps {
  readonly opened: OpenedGame;
  readonly send: (request: ShellRequest) => Promise<PlayReply>;
  /** Where saves are kept apart: "play" on the player page, "playtest" in the editor. */
  readonly edition: string;
  readonly store: Store;
  /** A new game's seed: a fresh one on the player page, the Play panel's own in the editor. */
  readonly seed: () => string;
  /** The page's clock: for each save's time, and the Daily's date. */
  readonly now?: () => Date;
  /** The browser's back closes a screen a button opened: the player page's, not the editor's. */
  readonly history?: boolean;
  /** A new version of the page waits: offered on the title only. */
  readonly update?: { readonly ready: boolean; readonly apply: () => void };
  /** The player page's crash screen covers the page; the editor shows what stopped in place. */
  readonly crashes?: boolean;
}
