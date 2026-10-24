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

export interface SpaceAsk {
  readonly space: string;
  readonly quality: WalkQuality;
  /** Sends `world/trigger` as the character walks into a zone, as a button's action is sent. */
  send(action: Action): Promise<Sent>;
}

export interface SpaceDrawn {
  /** The shell's pause over the game: no input, no steps, the frame held. */
  pause(on: boolean): void;
  quality(next: WalkQuality): void;
  stop(): void;
}

export interface SpaceHost {
  /** A space's name, for a widget with no label of its own. */
  name(space: string): string | undefined;
  /** Draws the space into `box`, walked, until stopped. */
  draw(box: HTMLElement, ask: SpaceAsk): SpaceDrawn;
}
