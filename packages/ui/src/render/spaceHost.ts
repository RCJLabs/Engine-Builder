/**
 * What a Space widget asks of the page it is drawn on (M5.8, D70, docs/specs/movement.md#the-space-widget):
 * packages/ui draws the box; the host draws the space into it and walks it. The editor's Play panel,
 * the player page and an exported game are hosts. Without one, the box says where it is walked.
 */
import type { Action } from '@eb/core';
import type { BattleShown } from '../session/battle.ts';
import type { FightView } from '../session/fighting.ts';
import type { QuestMarker } from '../session/markers.ts';

/** What came of a trigger the stage sent: the sim took it, refused it, or it waited on a step and was never sent. */
export type Sent = 'accepted' | 'refused' | 'dropped';

/** The player's quality in the shell's settings (M5.7's tiers, D69): Auto from the device's hints. */
export const WALK_QUALITIES = ['auto', 'low', 'medium', 'high'] as const;
export type WalkQuality = (typeof WALK_QUALITIES)[number];

/** An NPC of the space as the sim keeps it (M6.2): where it last stood, its goal, where it got to. */
export interface NpcGoal {
  readonly feet?: readonly [number, number, number];
  readonly yaw?: number;
  readonly goal?: string;
  readonly arrived?: string;
  /** M6.3: the metres it keeps from the player it follows, or that it stands turned to them. */
  readonly follow?: number;
  readonly facing?: 'player';
  /** M6.4 (D76): its turn among those sent to attack the player, and fallen. */
  readonly fight?: number;
  readonly down?: true;
}

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
  /** The NPCs of this space the sim knows of (M6.2), by actor: where each stood and where it is sent. */
  readonly npcs?: Readonly<Record<string, NpcGoal>>;
  /** The sim has the player in this space now: only then does the stage say where they stand. */
  here(): boolean;
  /** The game's clock runs as the space is walked now (M6.3, D75): the stage sends time/elapse. */
  clocked?(): boolean;
  /** The fights as the sim has them now (M6.4, D76): none in a game without the fighting kit. */
  fight?(): FightView | undefined;
  /** The battle on this space as the sim has it now (M7.5, D87), and the last step's beats to play back. */
  battle?(): BattleShown | undefined;
  /**
   * The tracked quest's open targets as the sim has them now (M6.6, D78), read each frame: none when
   * the shell's Quest markers setting is off.
   */
  markers?(): readonly QuestMarker[];
  /** Sends `world/trigger`, `world/use` and `world/at` as the character walks, as a button's action is sent. */
  send(action: Action): Promise<Sent>;
}

export interface SpaceDrawn {
  /** The shell's pause over the game: no input, no steps, the frame held. */
  pause(on: boolean): void;
  quality(next: WalkQuality): void;
  /** The objects taken here now, as the sim says after each step (M5.9). */
  taken(paths: readonly string[]): void;
  /** The NPCs here as the sim says after each step (M6.2): a walk-to sends one off. */
  npcs?(next: Readonly<Record<string, NpcGoal>>): void;
  stop(): void;
}

/** A pin on a space's map (M6.6, D78): metres across the ground, x and z as the space has them. */
export interface MapPin {
  readonly kind: 'player' | 'target' | 'door';
  readonly at: readonly [number, number];
  /** The way the player faces, in degrees: 0 is north, -z. */
  readonly yaw?: number;
  /** A target's, or a door's that stands in for one: its quest, objective and text. */
  readonly quest?: string;
  readonly objective?: string;
  readonly text?: string;
}

/** What a space-map widget draws (M6.6): the ground it covers in metres, its baked image if any, the pins. */
export interface SpaceMapShown {
  readonly space: string;
  /** [least x, least z, most x, most z]. */
  readonly bounds: readonly [number, number, number, number];
  readonly image?: string;
  readonly pins: readonly MapPin[];
}

/** What a space-map widget asks of the host: the space, the sim's markers and where it last heard everyone stood. */
export interface MapAsk {
  readonly space: string;
  readonly markers: readonly QuestMarker[];
  readonly at?: StandAt;
  readonly arrive?: string;
  readonly npcs?: Readonly<Record<string, NpcGoal>>;
}

export interface SpaceHost {
  /** A space's name, for a widget with no label of its own. */
  name(space: string): string | undefined;
  /** Draws the space into `box`, walked, until stopped. */
  draw(box: HTMLElement, ask: SpaceAsk): SpaceDrawn;
  /** The space's map with its pins (M6.6): the baked image, or plain ground. */
  map?(ask: MapAsk): Promise<SpaceMapShown>;
}
