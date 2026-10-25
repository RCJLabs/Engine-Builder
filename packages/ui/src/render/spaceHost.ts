/**
 * What a Space widget asks of the page it is drawn on (M5.8, D70, docs/specs/movement.md#the-space-widget):
 * packages/ui draws the box; the host draws the space into it and walks it. The editor's Play panel,
 * the player page and an exported game are hosts. Without one, the box says where it is walked.
 */
import type { Action } from '@eb/core';

/** What came of a trigger the stage sent: the sim took it, refused it, or it waited on a step and was never sent. */
export type Sent = 'accepted' | 'refused' | 'dropped';

/** The player's quality in the shell's settings (M5.7's tiers, D69): Auto from the device's hints. */
export const WALK_QUALITIES = ['auto', 'low', 'medium', 'high'] as const;
export type WalkQuality = (typeof WALK_QUALITIES)[number];

/** Where the player stood, from a load (M5.9): the feet, and the way they faced in degrees. */
export interface StandAt {
  readonly feet: readonly [number, number, number];
  readonly yaw: number;
}

export interface SpaceAsk {
  readonly space: string;
  readonly quality: WalkQuality;
  /** Where to stand as the walk starts (M5.9): from a load. */
  readonly at?: StandAt;
  /** The spawn point to arrive at when `at` is left out; the space's start when this is too. */
  readonly arrive?: string;
  /** The objects taken here, by path: neither drawn nor solid. */
  readonly taken: readonly string[];
  /** The sim has the player in this space now: only then does the stage say where they stand. */
  here(): boolean;
  /** Sends `world/trigger`, `world/use` and `world/at` as the character walks, as a button's action is sent. */
  send(action: Action): Promise<Sent>;
}

export interface SpaceDrawn {
  /** The shell's pause over the game: no input, no steps, the frame held. */
  pause(on: boolean): void;
  quality(next: WalkQuality): void;
  /** The objects taken here now, as the sim says after each step (M5.9). */
  taken(paths: readonly string[]): void;
  stop(): void;
}

export interface SpaceHost {
  /** A space's name, for a widget with no label of its own. */
  name(space: string): string | undefined;
  /** Draws the space into `box`, walked, until stopped. */
  draw(box: HTMLElement, ask: SpaceAsk): SpaceDrawn;
}
