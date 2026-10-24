/**
 * Colliders fitted to a model (M5.5, D67, docs/specs/models.md#the-models-form): a box, a sphere or
 * an upright capsule around every vertex the model draws, in its own metres, as plain arithmetic
 * so the import's worker carries no three. A hull is hull.ts's. Numbers are rounded to a tenth of a
 * millimetre so a record reads the same from every engine.
 */

import type { ModelCollider, Vec3 } from '@eb/schema';
import type { Document } from '@gltf-transform/core';

/** The least a side, a radius or a height is: a flat model still has a collider that can be. */
export const THINNEST = 0.01;

export const round = (n: number): number => Math.round(n * 1e4) / 1e4 + 0;
const vec = (x: number, y: number, z: number): Vec3 => [round(x), round(y), round(z)];

/**
 * Every vertex the default scene draws, in the model's own metres: each mesh's positions through
 * its node's place in the scene, quantised ones read back as their values.
 */
export function modelPositions(doc: Document): Float32Array {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const out: number[] = [];
  const v = [0, 0, 0];
  scene?.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const m = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      if (!positions) continue;
      for (let i = 0; i < positions.getCount(); i++) {
        positions.getElement(i, v);
        const [x, y, z] = v as [number, number, number];
        out.push(
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        );
      }
    }
  });
  return new Float32Array(out);
}

interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

function boxOf(points: Float32Array): Box {
  if (points.length < 3) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i++) {
    const c = i % 3;
    min[c] = Math.min(min[c] as number, points[i] as number);
    max[c] = Math.max(max[c] as number, points[i] as number);
  }
  return { min: min as unknown as Vec3, max: max as unknown as Vec3 };
}

const middle = ({ min, max }: Box): Vec3 => [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

/** The box around every point, each side at least THINNEST. */
export function fitBox(points: Float32Array): ModelCollider {
  const box = boxOf(points);
  const [x, y, z] = middle(box);
  const side = (c: 0 | 1 | 2) => Math.max(THINNEST, box.max[c] - box.min[c]);
  return { shape: 'box', center: vec(x, y, z), size: vec(side(0), side(1), side(2)) };
}

/** A sphere around every point, from the middle of their box. */
export function fitSphere(points: Float32Array): ModelCollider {
  const [cx, cy, cz] = middle(boxOf(points));
  let most = 0;
  for (let i = 0; i < points.length; i += 3) {
    const d = Math.hypot((points[i] as number) - cx, (points[i + 1] as number) - cy, (points[i + 2] as number) - cz);
    if (d > most) most = d;
  }
  return { shape: 'sphere', center: vec(cx, cy, cz), radius: round(Math.max(THINNEST, most)) };
}

/**
 * An upright capsule around every point: its radius the farthest any point is from the box's
 * upright middle line, its length just enough that each point is inside a cap or the side.
 */
export function fitCapsule(points: Float32Array): ModelCollider {
  const [cx, cy, cz] = middle(boxOf(points));
  let radius = THINNEST;
  for (let i = 0; i < points.length; i += 3) {
    radius = Math.max(radius, Math.hypot((points[i] as number) - cx, (points[i + 2] as number) - cz));
  }
  // The straight part's half length: each point above or below it lies within a cap of `radius`.
  let half = 0;
  for (let i = 0; i < points.length; i += 3) {
    const out = Math.hypot((points[i] as number) - cx, (points[i + 2] as number) - cz);
    const rise = Math.abs((points[i + 1] as number) - cy);
    half = Math.max(half, rise - Math.sqrt(Math.max(0, radius * radius - out * out)));
  }
  const r = round(radius);
  return { shape: 'capsule', center: vec(cx, cy, cz), radius: r, height: round(Math.max(2 * r, 2 * (half + radius))) };
}
