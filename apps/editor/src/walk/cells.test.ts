/**
 * The walk's cells and footprints as plain functions (M5.10, D72, docs/specs/streaming.md#cells):
 * which cells a footprint touches, the near ring and the kept one, what is far, each object's reach
 * through prefabs, and the streamer's rings as the player crosses cells.
 */
import type { SpaceJson } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { apart, CELL, cellOf, cellsOf, distanceTo, type Footprint, farOf, indexOf, nearOf } from './cells.ts';
import { streamedOf } from './footprints.ts';
import { partsOf, type Solid } from './solids.ts';
import { createStreamer } from './streamer.ts';

const at = (id: string, x: number, z: number, reach = 0.5): Footprint => ({ id, at: [x, z], reach });

describe('cells', () => {
  it('cuts the ground into 64 m squares from the origin, either side of it', () => {
    expect(CELL).toBe(64);
    expect(cellOf(0, 0)).toEqual([0, 0]);
    expect(cellOf(63.99, 64)).toEqual([0, 1]);
    expect(cellOf(-0.01, -64)).toEqual([-1, -1]);
    expect(cellOf(-64.01, 128)).toEqual([-2, 2]);
    expect(apart([0, 0], [2, -1])).toBe(2);
  });

  it('puts a footprint in every cell its box touches, and no other', () => {
    expect(cellsOf(at('a', 32, 32))).toEqual([[0, 0]]);
    expect(cellsOf(at('b', 63.8, 32, 0.5))).toEqual([
      [0, 0],
      [1, 0],
    ]);
    // A lake 200 m across, in the middle of four cells, touches each of the 4 × 4 around it.
    expect(cellsOf(at('lake', 0, 0, 100))).toHaveLength(16);
  });

  it('builds the 3×3 around the player, and keeps what is built until it leaves the 5×5', () => {
    const index = indexOf([at('here', 32, 32), at('beside', 96, 32), at('two', 160, 32), at('far', 300, 32)]);
    const first = nearOf(index, [0, 0], new Set());
    expect([...first].sort()).toEqual(['beside', 'here']);
    // A step east: "two" comes near; "here" is a cell away and stays.
    const east = nearOf(index, [1, 0], first);
    expect([...east].sort()).toEqual(['beside', 'here', 'two']);
    // Two cells east: "here" is two cells off and was built, so it is kept.
    expect([...nearOf(index, [2, 0], east)].sort()).toEqual(['beside', 'here', 'two']);
    // Three: it leaves, and "far", in the cell beyond, comes near.
    expect([...nearOf(index, [3, 0], east)].sort()).toEqual(['beside', 'far', 'two']);
    // Not built before, two cells off isn't built now.
    expect([...nearOf(index, [2, 0], new Set())].sort()).toEqual(['beside', 'two']);
  });

  it('draws far what isn’t near and comes within the view distance by its edge', () => {
    const footprints = [at('near', 10, 0), at('edge', 260, 0, 20), at('past', 300, 0, 5)];
    expect(distanceTo(footprints[1] as Footprint, 0, 0)).toBe(240);
    expect(distanceTo(at('in', 0, 0, 3), 1, 1)).toBe(0);
    expect(farOf(footprints, 0, 0, 250, new Set(['near']))).toEqual(['edge']);
  });
});

const space = (objects: SpaceJson['objects']): SpaceJson => ({ name: 'Test', objects });
const noModels = () => null;

describe('footprints', () => {
  it('reaches as far as anything inside a placement does, through its prefab, turned and scaled', () => {
    const prefabs = new Map<string, SpaceJson>([
      [
        'pair',
        space([
          { id: 'a', shape: 'box', at: [3, 0, 0] },
          { id: 'b', shape: 'box', at: [-1, 0, 0] },
        ]),
      ],
    ]);
    const made = streamedOf(
      space([
        { id: 'shed', prefab: 'pair', at: [100, 0, 50], turn: [0, 90, 0], scale: [2, 2, 2] },
        { id: 'stone', shape: 'sphere', at: [10, 0, 0] },
      ]),
      prefabs,
      noModels,
    );
    const [shed, stone] = made.footprints;
    expect(shed?.at).toEqual([100, 50]);
    // The far box stands 6 m off once doubled, turned to -z; its own half-diagonal, doubled, is √3.
    expect(shed?.reach).toBeCloseTo(6 + Math.sqrt(3), 6);
    expect(stone?.reach).toBeCloseTo(Math.sqrt(3) / 2, 6);
  });

  it('measures a placed model by its collider, half a metre without one, and lists it for far drawing', () => {
    const models = (key: string) =>
      key === 'model:rock'
        ? { collider: { shape: 'sphere' as const, center: [0, 1, 0] as [number, number, number], radius: 2 } }
        : {};
    const made = streamedOf(
      space([
        { id: 'rock', record: 'model:rock', at: [0, 0, 0], scale: [2, 2, 2] },
        { id: 'post', record: 'model:post', at: [5, 0, 5] },
        { id: 'lake', shape: 'plane', at: [0, 0, 0], scale: [100, 1, 100], components: { water: {} } },
      ]),
      new Map(),
      models,
    );
    expect(made.footprints.map((f) => f.reach)).toEqual([6, 0.5, expect.closeTo(Math.sqrt(20001) / 2, 6)]);
    expect(made.placements.map((p) => [p.top, p.key])).toEqual([
      ['rock', 'model:rock'],
      ['post', 'model:post'],
    ]);
    expect([...made.water]).toEqual(['lake']);
  });
});

describe('the streamer', () => {
  const row = space(
    Array.from({ length: 8 }, (_, i) => ({
      id: `post-${i}`,
      shape: 'box' as const,
      at: [32 + i * 64, 0, 32] as [number, number, number],
      components: { collider: {} },
    })),
  );
  const parts = partsOf(row, new Map(), noModels, new Set());
  const { footprints } = streamedOf(row, new Map(), noModels);

  it('builds the ring around the start, nearest first, and the rest of the row far to the view distance', () => {
    const streamer = createStreamer(parts, footprints, 200);
    const ring = streamer.at(32, 32, new Set());
    expect([...(ring?.near ?? [])]).toEqual(['post-0', 'post-1']);
    expect(ring?.added).toEqual(['post-0', 'post-1']);
    expect(ring?.solids.map((s: Solid) => s.path)).toEqual(['post-0', 'post-1']);
    expect(ring?.far).toEqual(['post-2', 'post-3']);
    expect(ring?.farthest).toBeCloseTo(192 - Math.sqrt(3) / 2, 6);
    // The same cell again: nothing new.
    expect(streamer.at(40, 40, new Set())).toBeNull();
  });

  it('builds what comes near and takes down what leaves the kept ring as the player crosses cells', () => {
    const streamer = createStreamer(parts, footprints, 200);
    streamer.at(32, 32, new Set());
    const one = streamer.at(96, 32, new Set());
    expect(one?.added).toEqual(['post-2']);
    expect(one?.gone).toEqual([]);
    streamer.at(160, 32, new Set());
    const three = streamer.at(224, 32, new Set());
    expect(three?.added).toEqual(['post-4']);
    expect(three?.gone).toEqual(['post-0']);
    expect([...(three?.near ?? [])]).toEqual(['post-1', 'post-2', 'post-3', 'post-4']);
  });

  it('leaves out the solids of what is taken, and works the far out again when the view distance changes', () => {
    const streamer = createStreamer(parts, footprints, 200);
    const ring = streamer.at(32, 32, new Set(['post-1']));
    expect(ring?.solids.map((s) => s.path)).toEqual(['post-0']);
    streamer.view(400);
    expect(streamer.at(32, 32, new Set())?.far).toEqual(['post-2', 'post-3', 'post-4', 'post-5', 'post-6']);
  });
});
