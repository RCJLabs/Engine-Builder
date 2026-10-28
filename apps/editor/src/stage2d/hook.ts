/**
 * window.__ebStage2d (M7.1, D83, docs/specs/2d-scenes.md#play): what the 2D stage drew, for the
 * e2e and the editor's tools to read as they read window.__ebWalk: the space, the scale and the
 * canvas's art pixels, the camera, each item as drawn (sprite, clip, frame, whole-pixel place,
 * flip), a frame count, the uses' buttons, the walkers and what was sent. Read only; `look` moves
 * the camera as a drag would. Since M7.2 each walker's route as tiles, and the space's tilemap: its
 * size, tile, corner and each layer's frame at each cell as drawn. Since M7.3 each walker's route through a
 * building as floors and x, and the building's pieces as drawn. Since M7.4, for a space drawn by its
 * stage, code(): what the stage drew. Since M7.5, battle(): the battle as drawn and played.
 */

import type { BuildingPiece } from './building2d.ts';
import type { Point } from './camera.ts';
import type { Drawn } from './draw.ts';
import type { Rect } from './place.ts';
import type { Scaled } from './scale.ts';

export interface Stage2dHook {
  readonly space: string;
  scaled(): Scaled & { readonly dpr: number };
  camera(): Point;
  drawn(): readonly Drawn[];
  frames(): number;
  uses(): readonly { path: string; label: string; box: Rect }[];
  used(): readonly { path: string; sent: string }[];
  walkers(): readonly {
    actor: string;
    at: Point;
    goal?: string;
    moving: boolean;
    flip: boolean;
    route?: readonly (readonly [number, number])[];
    floors?: readonly (readonly [number, number])[];
  }[];
  building():
    | { readonly path: string; readonly at: Point; readonly slot: Point; readonly pieces: readonly BuildingPiece[] }
    | undefined;
  tilemap():
    | {
        readonly path: string;
        readonly size: Point;
        readonly tile: Point;
        readonly at: Point;
        /** `frames[layer][row][col]`, -1 where a layer draws none. */
        readonly frames: readonly (readonly (readonly number[])[])[];
      }
    | undefined;
  npcsSent(): readonly { arrived: Readonly<Record<string, string>>; sent: string }[];
  clock(): { readonly owed: number; readonly sent: readonly { readonly ms: number; readonly sent: string }[] };
  look(at: Point): void;
  /** An item's world box, as placed in the file, for a test to aim at. */
  boxOf(path: string): Rect | undefined;
  /**
   * The battle on the space (M7.5): the view drawn, each unit as shown, the selection, the preview as the
   * action it sends, the cursor, whether a step plays back and which, the live line, the bar's buttons and
   * what was sent. Undefined before a battle and after.
   */
  battle?(): unknown;
  /**
   * A space drawn by its stage (M7.4): its entry, the frames it drew and the last one's milliseconds,
   * the uses it gave a box and those it didn't, and the error that stopped it, if one did.
   */
  code?(): {
    readonly stage: string;
    readonly frames: number;
    readonly ms: number;
    readonly boxed: readonly string[];
    readonly unboxed: readonly string[];
    readonly error?: string;
  };
}

declare global {
  interface Window {
    __ebStage2d?: Stage2dHook;
  }
}

/** The hook set while this stage runs; what it returns takes it away again, if it is still this one. */
export function publishHook(hook: Stage2dHook): () => void {
  window.__ebStage2d = hook;
  return () => {
    if (window.__ebStage2d === hook) delete window.__ebStage2d;
  };
}
