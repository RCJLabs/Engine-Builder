/**
 * One drag of the gizmo (M5.1, docs/specs/viewport.md#the-gizmo): from the press to each move of
 * the pointer, where the chosen objects would be. Along an axis it follows the point on the axis
 * nearest the pointer's ray; on a plane, where the ray meets it; on a ring, the angle around it from
 * where it was taken; the centre block, how far the pointer rose.
 */

import { type Box, type Boxed, type Latch, latch } from './bounds.ts';
import {
  AXES,
  type Axis,
  alongAxis,
  angleAround,
  factorOfRise,
  type Handle,
  moved,
  onPlane,
  type Placed,
  type Ray,
  scaled,
  turned,
} from './gizmoMath.ts';
import type { Screen } from './handles.ts';
import { sub, times, type Vec3 } from './vec.ts';

export interface DragStart {
  readonly handle: Handle;
  readonly pivot: Vec3;
  /** The gizmo's axes: the world's, or one object's own while scaling it. */
  readonly axes: readonly Vec3[];
  readonly objects: readonly Placed[];
  readonly ray: Ray;
  readonly screen: Screen;
  /** The grid's step for a move, in metres (M5.10). */
  readonly step?: number;
  /** For bounds snap (M5.10): the box of what is moved, the other objects', and how near, in metres, latches. */
  readonly boxes?: { readonly moving: Box; readonly others: readonly Boxed[]; readonly tolerance: number };
}

export interface Drag {
  /** Where the objects are with the pointer here, or null where the ray meets nothing to follow. */
  update(ray: Ray, screen: Screen, snap: boolean): Placed[] | null;
  /** What the last update latched onto (M5.10). */
  latched(): readonly Latch[];
}

const others = (axis: Axis): Axis[] => [((axis + 1) % 3) as Axis, ((axis + 2) % 3) as Axis];

export function startDrag(start: DragStart): Drag {
  const { handle, pivot, objects } = start;
  let latches: readonly Latch[] = [];
  const latched = () => latches;
  /** A move of `delta` along `axes`: snapped, it latches onto other boxes first, and the grid takes the rest. */
  const move = (delta: Vec3, axes: readonly Axis[], snap: boolean) => {
    const boxes = start.boxes;
    const found = snap && boxes ? latch(boxes.moving, boxes.others, delta, axes, boxes.tolerance) : null;
    latches = found?.latched ?? [];
    return moved(
      objects,
      found?.delta ?? delta,
      axes,
      snap,
      start.step,
      latches.map((l) => l.axis),
    );
  };
  if (handle.kind === 'scale-all') {
    return {
      update: (_ray, screen, snap) => scaled(objects, pivot, null, factorOfRise(start.screen[1] - screen[1]), snap),
      latched,
    };
  }
  const axis = handle.kind === 'scale' ? (start.axes[handle.axis] as Vec3) : AXES[handle.axis];
  if (handle.kind === 'move' || handle.kind === 'scale') {
    const from = alongAxis(start.ray, pivot, axis);
    return {
      update(ray, _screen, snap) {
        const t = alongAxis(ray, pivot, axis);
        if (from === null || t === null) return null;
        if (handle.kind === 'move') return move(times(axis, t - from), [handle.axis], snap);
        return scaled(objects, pivot, handle.axis, Math.abs(from) < 1e-6 ? 1 : t / from, snap);
      },
      latched,
    };
  }
  const from = onPlane(start.ray, pivot, axis);
  if (handle.kind === 'plane') {
    return {
      update(ray, _screen, snap) {
        const at = onPlane(ray, pivot, axis);
        if (!from || !at) return null;
        return move(sub(at, from), others(handle.axis), snap);
      },
      latched,
    };
  }
  // A ring: the angle from where it was taken hold of. Past 180° it reads as the other way round,
  // which is the same turn: a planted bug that added the angle up move by move changed nothing.
  const grip: Vec3 | null = from ? sub(from, pivot) : null;
  return {
    update(ray, _screen, snap) {
      const at = onPlane(ray, pivot, axis);
      if (!grip || !at) return null;
      return turned(objects, pivot, handle.axis, angleAround(grip, sub(at, pivot), axis), snap);
    },
    latched,
  };
}
