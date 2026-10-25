/**
 * What the shell is given (M4.3, D53): the open game as the worker described it, a way to send it
 * requests, and where its saves and settings are kept. The player page and the Play panel each make
 * these their own way.
 */
import type { SaveFile } from '@eb/core';
import type { Store } from '@eb/platform';
import type { SpaceHost } from '../render/spaceHost.ts';
import type { PlayReply, PlayRequest } from '../session/protocol.ts';
import type { View } from '../session/types.ts';

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
  /**
   * The editor's debug tools moved the game in play (M4.9): a debug step, a step back, a state
   * restored, a replay. The shell shows the view and keeps the save in the slot in play, as after a
   * step. A new `n` each time.
   */
  readonly moved?: Moved;
  /** Told whenever a game comes into play or leaves it: the editor shows its debug tools while one is. */
  readonly onPlay?: (playing: boolean) => void;
  /** Who draws the game's spaces (M5.8): the page's stage, made from the opened game's world. */
  readonly spaces?: SpaceHost;
}

export interface Moved {
  readonly n: number;
  readonly view: View;
  readonly save: SaveFile;
}
