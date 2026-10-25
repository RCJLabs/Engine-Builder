/**
 * The rings put to work (M5.10, D72, docs/specs/streaming.md#building): createStreaming over a row
 * of posts, with stand-ins for the walker, the zones, the uses and the view. A step into the next
 * cell builds a few a frame; a player put far away, as a respawn does, has the ring built whole.
 */
import type { SpaceJson } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { streamedOf } from './footprints.ts';
import { partsOf, type Solid, type UsePoint, type Zone } from './solids.ts';
import { createStreamer, type Ring } from './streamer.ts';
import { createStreaming } from './streaming.ts';
import type { WalkSpace } from './world.ts';

const row: SpaceJson = {
  name: 'Row',
  objects: Array.from({ length: 8 }, (_, i) => ({
    id: `post-${i}`,
    shape: 'box' as const,
    at: [32 + i * 64, 0, 32] as [number, number, number],
    components: { collider: {}, ...(i === 3 ? { trigger: {} } : {}), ...(i === 4 ? { interact: {} } : {}) },
  })),
};
const noModels = () => null;
const parts = partsOf(row, new Map(), noModels, new Set(['post-3']), new Map([['post-4', 'Use']]));
const space = { id: 'row', space: row, prefabs: new Map(), parts, streamed: streamedOf(row, new Map(), noModels) };

function stage() {
  const log: string[] = [];
  let bodies = 0;
  let zones: readonly Zone[] = [];
  let uses: readonly UsePoint[] = [];
  const walker = {
    add: (solids: readonly Solid[]) => {
      bodies += solids.length;
    },
    drop: (gone: ReadonlySet<string>) => {
      bodies -= gone.size;
      if (gone.size > 0) log.push(`drop ${[...gone].join(' ')}`);
    },
    bodies: () => bodies,
  };
  const view = {
    near: (_ids: ReadonlySet<string>, order: readonly string[]) => log.push(`near ${order.join(' ')}`),
    settle: () => log.push('settle'),
    far: () => {},
    streaming: () => ({ waiting: 0, far: { models: 0, meshes: 0, levels: [] }, slowest: 0, built: [] }),
  };
  const streamer = createStreamer(parts, space.streamed.footprints, 200);
  const first = streamer.at(32, 32, new Set()) as Ring;
  walker.add(first.solids);
  const streaming = createStreaming(
    space as unknown as WalkSpace,
    streamer,
    first,
    {
      walker: walker as never,
      sender: { zones: (next: readonly Zone[]) => (zones = next), heard: 0 } as never,
      acts: { uses: (next: readonly UsePoint[]) => (uses = next), offered: 0 } as never,
      view: () => view as never,
    },
    200,
    new Set(),
  );
  return { streaming, log, bodies: () => bodies, zones: () => zones, uses: () => uses };
}

describe('the rings put to work', () => {
  it('builds the start whole, then each next cell a few a frame, its zones and uses handed on', () => {
    const { streaming, log, bodies, zones, uses } = stage();
    expect(log).toEqual(['near post-0 post-1', 'settle']);
    expect(bodies()).toBe(2);
    streaming.step(96, 32, new Set());
    streaming.step(160, 32, new Set());
    expect(log.slice(2)).toEqual(['near post-2', 'near post-3']);
    expect(zones().map((z) => z.path)).toEqual(['post-3']);
    expect(uses()).toEqual([]);
    streaming.step(224, 32, new Set());
    expect(log.slice(4)).toEqual(['drop post-0', 'near post-4']);
    expect(uses().map((u) => u.path)).toEqual(['post-4']);
    expect(bodies()).toBe(4);
  });

  it('builds the ring whole when the player is put more than a cell away', () => {
    const { streaming, log, bodies, zones } = stage();
    streaming.step(480, 32, new Set());
    expect(log.slice(2)).toEqual(['drop post-0 post-1', 'near post-7 post-6', 'settle']);
    expect(bodies()).toBe(2);
    expect(zones()).toEqual([]);
  });
});
