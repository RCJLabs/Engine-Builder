/**
 * Format 15 (M6.7, D79, docs/specs/radiant.md#the-pack-format-15): the spaces' and their objects'
 * tags, only when one has a tag, so every pack without keeps its format and its hash; the world
 * module's places read from it, each space's name beside its tags; and the shape readPack holds it to.
 */
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../canonical.ts';
import { createPack, readPack } from '../pack.ts';
import type { PackWorld } from './packWorld.ts';
import { worldDataOf } from './packWorld.ts';
import { hasTags, type PackPlaces } from './places.ts';

const project = { id: 'hollow', name: 'Hollow', version: '0.1.0' };
const records = { item: { rope: { name: 'Rope' } } };
const reloaded = (value: unknown): Record<string, unknown> => JSON.parse(canonicalJson(value));
const world: PackWorld = {
  spaces: { green: { name: 'The green', objects: [] }, cave: { name: 'The cave', objects: [] } },
  prefabs: {},
  triggers: {},
  files: {},
  records: {},
  fields: {},
  uses: {},
  spawns: { cave: [], green: [] },
  start: 'green',
  actors: { wick: { space: 'cave', path: 'wick' } },
};
const PLACES: PackPlaces = {
  spaces: { cave: { tags: ['cave'] }, green: { tags: [] } },
  objects: { cave: { 'stash/chest': { tags: ['cache'], name: 'Old chest' }, wick: { tags: ['chief'] } } },
};
const UNTAGGED: PackPlaces = { spaces: { cave: { tags: [] }, green: { tags: [] } }, objects: {} };
const pack = (given: PackWorld) => createPack(project, records, undefined, undefined, undefined, undefined, given);

describe('format 15', () => {
  it('carries the places and the actors once a space or an object has a tag', () => {
    const tagged = pack({ ...world, places: PLACES });
    expect(tagged.format).toBe(15);
    expect(tagged.world).toMatchObject({ places: PLACES, actors: world.actors, navmeshes: {} });
    expect(readPack(reloaded(tagged))).toEqual(reloaded(tagged));
  });

  it('leaves them out, format and hash and all, when nothing has a tag', () => {
    expect(hasTags(UNTAGGED)).toBe(false);
    expect(hasTags(undefined)).toBe(false);
    expect(hasTags({ spaces: { cave: { tags: [] } }, objects: { cave: { x: { tags: ['y'] } } } })).toBe(true);
    const plain = pack({ ...world, places: UNTAGGED });
    expect(plain).toEqual(pack(world));
    expect(plain.format).toBe(10);
    expect(plain.world).not.toHaveProperty('places');
  });

  it('reads each space’s name beside its tags into the module’s places, and the actors', () => {
    expect(worldDataOf({ ...world, places: PLACES }).places).toEqual({
      spaces: { cave: { name: 'The cave', tags: ['cave'] }, green: { name: 'The green', tags: [] } },
      objects: PLACES.objects,
      actors: world.actors,
    });
  });

  it('refuses places that aren’t, and places before format 15', () => {
    const read = reloaded(pack({ ...world, places: PLACES }));
    const withPlaces = (places: unknown) => () => readPack({ ...read, world: { ...(read.world as object), places } });
    expect(withPlaces(undefined)).toThrow('A format 15 pack has no places');
    expect(withPlaces({ ...PLACES, more: 1 })).toThrow('Unknown pack places fields: more');
    expect(withPlaces({ ...PLACES, spaces: { cave: { tags: ['cave'] } } })).toThrow('the space "green" no tags');
    expect(withPlaces({ ...PLACES, spaces: { ...PLACES.spaces, cave: { tags: ['cave', 'cave'] } } })).toThrow(
      'the space "cave" no tags',
    );
    expect(withPlaces({ ...PLACES, spaces: { ...PLACES.spaces, moor: { tags: [] } } })).toThrow(
      'Places of a space the pack lacks: "moor"',
    );
    expect(withPlaces({ ...PLACES, objects: { moor: {} } })).toThrow('Tagged objects of a space the pack lacks');
    expect(withPlaces({ ...PLACES, objects: { cave: { 'Big Chest': { tags: ['x'] } } } })).toThrow(
      `"Big Chest" is not an object's path`,
    );
    expect(withPlaces({ ...PLACES, objects: { cave: { chest: { tags: [] } } } })).toThrow('has no tags');
    expect(withPlaces({ ...PLACES, objects: { cave: { chest: { tags: ['x'], name: 3 } } } })).toThrow(
      'name is not text',
    );
    const ten = reloaded(pack(world));
    expect(() => readPack({ ...ten, world: { ...(ten.world as object), places: PLACES } })).toThrow(
      'Unknown pack world fields: places',
    );
  });
});
