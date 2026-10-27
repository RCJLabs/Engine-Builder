/**
 * window.__ebStage2d (M7.1, D83, docs/specs/2d-scenes.md#play): what the 2D stage drew, for the
 * e2e and the editor's tools to read as they read window.__ebWalk: the space, the scale and the
 * canvas's art pixels, the camera, each item as drawn (sprite, clip, frame, whole-pixel place,
 * flip), a frame count, the uses' buttons, the walkers and what was sent. Read only; `look` moves
 * the camera as a drag would.
 */
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
  walkers(): readonly { actor: string; at: Point; goal?: string; moving: boolean; flip: boolean }[];
  npcsSent(): readonly { arrived: Readonly<Record<string, string>>; sent: string }[];
  clock(): { readonly owed: number; readonly sent: readonly { readonly ms: number; readonly sent: string }[] };
  look(at: Point): void;
  /** An item's world box, as placed in the file, for a test to aim at. */
  boxOf(path: string): Rect | undefined;
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
