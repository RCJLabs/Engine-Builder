/**
 * One drag of the gizmo (M5.1, docs/specs/viewport.md#the-gizmo): from the press to each move of
 * the pointer, where the chosen objects would be. Along an axis it follows the point on the axis
 * nearest the pointer's ray; on a plane, where the ray meets it; on a ring, the angle around it,
 * added up so a drag can turn more than half way round; the centre block, how far the pointer rose.
 */
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
}

export interface Drag {
  /** Where the objects are with the pointer here, or null where the ray meets nothing to follow. */
  update(ray: Ray, screen: Screen, snap: boolean): Placed[] | null;
}

const others = (axis: Axis): Axis[] => [((axis + 1) % 3) as Axis, ((axis + 2) % 3) as Axis];

export function startDrag(start: DragStart): Drag {
  const { handle, pivot, objects } = start;
  if (handle.kind === 'scale-all') {
    return {
      update: (_ray, screen, snap) => scaled(objects, pivot, null, factorOfRise(start.screen[1] - screen[1]), snap),
    };
  }
  const axis = handle.kind === 'scale' ? (start.axes[handle.axis] as Vec3) : AXES[handle.axis];
  if (handle.kind === 'move' || handle.kind === 'scale') {
    const from = alongAxis(start.ray, pivot, axis);
    return {
      update(ray, _screen, snap) {
        const t = alongAxis(ray, pivot, axis);
        if (from === null || t === null) return null;
        if (handle.kind === 'move') return moved(objects, times(axis, t - from), [handle.axis], snap);
        return scaled(objects, pivot, handle.axis, Math.abs(from) < 1e-6 ? 1 : t / from, snap);
      },
    };
  }
  const from = onPlane(start.ray, pivot, axis);
  if (handle.kind === 'plane') {
    return {
      update(ray, _screen, snap) {
        const at = onPlane(ray, pivot, axis);
        if (!from || !at) return null;
        return moved(objects, sub(at, from), others(handle.axis), snap);
      },
    };
  }
  // A ring: the angle added up move by move, so it goes past 180° without flipping back.
  let last: Vec3 | null = from ? sub(from, pivot) : null;
  let total = 0;
  return {
    update(ray, _screen, snap) {
      const at = onPlane(ray, pivot, axis);
      if (!last || !at) return null;
      const now = sub(at, pivot);
      total += angleAround(last, now, axis);
      last = now;
      return turned(objects, pivot, handle.axis, total, snap);
    },
  };
}
