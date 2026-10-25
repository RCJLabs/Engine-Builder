/**
 * window.__ebWalk (M5.8, D70, docs/specs/movement.md#the-hook): what the e2e reads of a space being
 * walked, set while one is drawn, as window.__ebViewport is for the Scene panel's view.
 */
import type { Sent } from '@eb/ui';
import type { Vec3 } from '../spaces/vec.ts';
import type { PerfSummary } from '../spaces/viewportHook.ts';
import type { ViewKind } from './cameras.ts';

export interface WalkHook {
  readonly space: string;
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
  /** Where each solid that moves is. */
  moving(): readonly { readonly path: string; readonly at: Vec3 }[];
  readonly frames: number;
  readonly paused: boolean;
  perf(): PerfSummary;
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
