/**
 * window.__ebWalk (M5.8, D70, docs/specs/movement.md#the-hook): what the e2e reads of a space being
 * walked, set while one is drawn, as window.__ebViewport is for the Scene panel's view. M5.9 adds
 * how it began, the prompt, the uses and stands sent, and what is taken; M5.10, its cells.
 */
import type { Sent } from '@eb/ui';
import type { Vec3 } from '../spaces/vec.ts';
import type { PerfSummary } from '../spaces/viewportHook.ts';
import type { ViewKind } from './cameras.ts';
import type { NpcSeen } from './npcView.ts';

/** What the walk has built and drawn of its space (M5.10, docs/specs/streaming.md#the-hook). */
export interface WalkCells {
  readonly cell: readonly [number, number];
  /** The objects near: solid, their zones heard and uses offered, drawn or waiting to be. */
  readonly near: readonly string[];
  /** Of those, the ones drawn, sorted. */
  readonly drawn: readonly string[];
  readonly waiting: number;
  /** The far models drawn, in how many instanced meshes, and each mesh's LOD level. */
  readonly far: { readonly models: number; readonly meshes: number; readonly levels: readonly number[] };
  readonly bodies: number;
  readonly zones: number;
  readonly uses: number;
  /** The view distance, in metres, and how far off the farthest object drawn far is. */
  readonly view: number;
  readonly farthest: number;
  /** The longest a frame's building took, in ms. */
  readonly slowest: number;
}

export interface WalkHook {
  readonly space: string;
  /** How the walk began (M5.9): where a load stood the player, the spawn point arrived at, or the start. */
  readonly began: { readonly from: 'at' | 'arrive' | 'start'; readonly spawn?: string };
  character(): {
    readonly feet: Vec3;
    readonly velocity: Vec3;
    readonly grounded: boolean;
    readonly view: ViewKind;
    readonly yaw: number;
    readonly pitch: number;
  };
  camera(): { readonly at: Vec3; readonly distance: number };
  /** The zones the character is in now. */
  zones(): readonly string[];
  /** Each trigger sent, in order, with what the sim made of it once it answered. */
  sent(): readonly { readonly object: string; readonly sent: Sent | 'waiting' }[];
  /** What the Interact prompt offers now (M5.9): the object faced and its label, or null. */
  prompt(): { readonly object: string; readonly label: string } | null;
  /** Each world/use sent, in order, with what the sim made of it once it answered. */
  used(): readonly { readonly object: string; readonly sent: Sent | 'waiting' }[];
  /** Each world/at sent, in order, as sent, with its answer. */
  stood(): readonly { readonly feet: readonly number[]; readonly yaw: number; readonly sent: Sent | 'waiting' }[];
  /** The objects taken here, as the sim says, sorted. */
  taken(): readonly string[];
  /** Of those, the ones the view has and doesn't draw, read from three's scene. */
  hidden(): readonly string[];
  /** Where each solid that moves is. */
  moving(): readonly { readonly path: string; readonly at: Vec3 }[];
  readonly frames: number;
  readonly paused: boolean;
  perf(): PerfSummary;
  /** What is built near and drawn far (M5.10). */
  cells(): WalkCells;
  /** The NPCs built (M6.1): each one's actor, what it draws as, and the yaws it faces and was placed at. */
  npcs(): readonly NpcSeen[];
}

declare global {
  interface Window {
    __ebWalk?: WalkHook;
  }
}

export const setWalkHook = (hook: WalkHook) => {
  window.__ebWalk = hook;
};

/** Taken away only if it is still this one's: a new walk may have set its own. */
export const clearWalkHook = (hook: WalkHook) => {
  if (window.__ebWalk === hook) delete window.__ebWalk;
};
