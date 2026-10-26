/**
 * Format 14 (M6.6, D78, docs/specs/markers.md#pack-format-14): the spaces' maps, only when one is
 * baked, so a walked game without a map keeps its format and its hash.
 */
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../canonical.ts';
import { createPack, readPack } from '../pack.ts';
import type { PackWorld } from './packWorld.ts';

const project = { id: 'glen', name: 'Glen', version: '0.1.0' };
const records = { item: { rope: { name: 'Rope' } } };
const reloaded = (value: unknown): Record<string, unknown> => JSON.parse(canonicalJson(value));
const IMAGE = 'spaces/glen.map.webp';
const MAP = { bounds: [-20, -20, 20, 20], size: [1024, 1024], image: IMAGE } as const;
const world: PackWorld = {
  spaces: { glen: { name: 'Glen', objects: [] }, bothy: { name: 'Bothy', objects: [] } },
  prefabs: {},
  triggers: {},
  files: { [IMAGE]: 'UklGRg==' },
  records: {},
  fields: {},
  uses: {},
  spawns: { glen: [], bothy: [] },
  start: 'glen',
};
const pack = (given: PackWorld, more: Partial<typeof project> & Record<string, unknown> = {}) =>
  createPack({ ...project, ...more }, records, undefined, undefined, undefined, undefined, given);

describe('format 14', () => {
  it('carries the maps, with format 11 to 13’s navmeshes and actors, none or not', () => {
    const mapped = pack({ ...world, maps: { glen: MAP } });
    expect(mapped.format).toBe(14);
    expect(mapped.world).toMatchObject({ maps: { glen: MAP }, navmeshes: {}, actors: {} });
    expect(readPack(reloaded(mapped))).toEqual(mapped);
    // With a clock and the fighting it is still 14: each is the project's, not the world's.
    const all = pack(
      { ...world, maps: { glen: MAP } },
      { kits: ['time', 'fighting'], clock: { rate: 20 }, fighting: { player: 'hero', combat: 'blades' } },
    );
    expect(all.format).toBe(14);
    expect(all.project).toMatchObject({ clock: { rate: 20 }, fighting: { player: 'hero', combat: 'blades' } });
    expect(readPack(reloaded(all))).toEqual(all);
  });

  it('is not written without a map: the format and the hash are what they were', () => {
    const before = pack(world);
    expect(before.format).toBe(10);
    const none = pack({ ...world, maps: {} });
    expect(none).toEqual(before);
    expect(none.world).not.toHaveProperty('maps');
    const fought = { kits: ['fighting'], fighting: { player: 'hero', combat: 'blades' } };
    expect(pack({ ...world, maps: {} }, fought)).toEqual(pack(world, fought));
  });

  it('refuses a map that isn’t one, and maps before format 14', () => {
    const read = reloaded(pack({ ...world, maps: { glen: MAP } }));
    const withMaps = (maps: unknown) => () => readPack({ ...read, world: { ...(read.world as object), maps } });
    expect(withMaps({})).toThrow('A format 14 pack has no maps');
    expect(withMaps({ barn: MAP })).toThrow('A map of a space the pack lacks: "barn"');
    expect(withMaps({ glen: { ...MAP, hash: 'x' } })).toThrow('is not its bounds, size and image');
    expect(withMaps({ glen: { ...MAP, bounds: [20, -20, -20, 20] } })).toThrow('has no ground');
    expect(withMaps({ glen: { ...MAP, size: [1024.5, 1024] } })).toThrow('has no size in pixels');
    expect(withMaps({ glen: { ...MAP, image: 'spaces/glen.map.png' } })).toThrow('has no image in the pack');
    const ten = reloaded(pack(world));
    expect(() => readPack({ ...ten, world: { ...(ten.world as object), maps: { glen: MAP } } })).toThrow(
      'Unknown pack world fields: maps',
    );
  });
});
