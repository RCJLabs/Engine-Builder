/**
 * The near objects' queue (M5.10, D72, docs/specs/streaming.md#building): a frame builds for at
 * most BUDGET_MS, at least one object, in the order the ring gives; a ring built whole is built at
 * once. A stand-in builder and a clock that moves 1.5 ms a reading, so no frame depends on the
 * computer's speed.
 */
import * as THREE from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { createBuilder } from '../spaces/build.ts';
import type { SpaceJson } from '../spaces/spaceFile.ts';
import { BUDGET_MS, createNearObjects } from './nearObjects.ts';

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const SPACE = { name: 'Row', objects: IDS.map((id) => ({ id, shape: 'box' })) } as unknown as SpaceJson;

/** Builds a group tagged with the object's id, as build.ts tags each placement. */
const builder = {
  build(space: SpaceJson) {
    const root = new THREE.Group();
    const node = new THREE.Group();
    node.userData.objectId = space.objects[0]?.id;
    root.add(node);
    return { root };
  },
} as unknown as ReturnType<typeof createBuilder>;

/** A clock that moves `step` ms each time it is read. */
function clock(step: number): void {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    now += step;
    return now;
  });
}

const near = () =>
  createNearObjects(
    SPACE,
    new Map(),
    builder,
    () => (() => null) as never,
    () => {},
    false,
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the near objects', () => {
  it('builds for at most BUDGET_MS a frame, in the order the ring gives', () => {
    clock(1.5);
    const objects = near();
    objects.want(new Set(IDS), ['c', 'a', 'b', 'd', 'e', 'f', 'g', 'h']);
    expect(objects.build(false)).toBe(true);
    // Read at 1.5, 3 and 4.5 ms past the start: three built, the fourth left to the next frame.
    expect(BUDGET_MS).toBe(4);
    expect(objects.built()).toEqual(['a', 'b', 'c']);
    expect(objects.waiting).toBe(5);
    expect(objects.slowest).toBe(6);
    objects.build(false);
    expect(objects.built()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('builds at least one a frame, however slow, and a ring built whole at once', () => {
    clock(50);
    const objects = near();
    objects.want(new Set(IDS), IDS);
    objects.build(false);
    expect(objects.built()).toEqual(['a']);
    expect(objects.build(true)).toBe(true);
    expect(objects.built()).toEqual(IDS);
    expect(objects.waiting).toBe(0);
    expect(objects.build(false)).toBe(false);
    // The whole ring waited under the loading screen: only the spread frame counts.
    expect(objects.slowest).toBe(100);
  });

  it('takes down what leaves, and builds what comes in ahead of what still waits', () => {
    clock(1.5);
    const objects = near();
    objects.want(new Set(['a', 'b', 'c', 'd', 'e']), ['a', 'b', 'c', 'd', 'e']);
    objects.build(false);
    expect(objects.built()).toEqual(['a', 'b', 'c']);
    objects.want(new Set(['b', 'c', 'd', 'e', 'h']), ['h']);
    expect(objects.built()).toEqual(['b', 'c']);
    expect(objects.waiting).toBe(3);
    objects.build(false);
    expect(objects.built()).toEqual(['b', 'c', 'd', 'e', 'h']);
    expect(objects.root.children.map((c) => c.userData.objectId)).toEqual(['b', 'c', 'h', 'd', 'e']);
  });
});
