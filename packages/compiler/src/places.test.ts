/**
 * The pack's places (M6.7, D79, docs/specs/radiant.md#tags): every space's tags and each tagged
 * object's, through prefabs and overrides, with the name `{slot}` shows; the checks' view of them
 * with each placed actor's; and E058 for tags a file can't hold.
 */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { placesOf, spaceTagsOf } from './places.ts';
import { memorySource } from './source.ts';
import type { SpaceJson } from './spaceShape.ts';
import type { SpaceFileRead } from './spaces.ts';

const CACHE: SpaceJson = {
  name: 'Cache',
  objects: [
    { id: 'chest', shape: 'box', tags: ['cache'] },
    { id: 'lid', shape: 'box' },
  ],
};
const CAVE: SpaceJson = {
  name: 'The cave',
  tags: ['dark', 'cave'],
  objects: [
    { id: 'stash', prefab: 'cache' },
    { id: 'empty', prefab: 'cache', name: 'Empty', overrides: { chest: { tags: ['empty'] } } },
    { id: 'named', prefab: 'cache', overrides: { chest: { name: 'Strongbox' } } },
    { id: 'whole', prefab: 'cache', tags: ['crate'] },
    { id: 'wick', record: 'actor:wick', tags: ['chief'] },
    { id: 'rock', shape: 'box' },
  ],
};
const GREEN: SpaceJson = {
  name: 'The green',
  objects: [{ id: 'board', shape: 'box', name: 'Board', tags: ['board'] }],
};
const records: Record<string, unknown> = { 'actor:wick': { name: 'Wick' } };

describe('the pack’s places', () => {
  it('holds every space’s tags sorted, and each tagged object by its path, through prefabs and overrides', () => {
    const places = placesOf(
      new Map([
        ['green', GREEN],
        ['cave', CAVE],
      ]),
      new Map([['cache', CACHE]]),
      (key) => records[key],
    );
    expect(places).toEqual({
      spaces: { cave: { tags: ['cave', 'dark'] }, green: { tags: [] } },
      objects: {
        cave: {
          // Its own name, else its placed record's, else its prefab's; or none.
          'empty/chest': { tags: ['empty'] },
          'named/chest': { tags: ['cache'], name: 'Strongbox' },
          'stash/chest': { tags: ['cache'] },
          whole: { tags: ['crate'], name: 'Cache' },
          // A placement's tags are its own: its chest keeps the prefab's.
          'whole/chest': { tags: ['cache'] },
          wick: { tags: ['chief'], name: 'Wick' },
        },
        green: { board: { tags: ['board'], name: 'Board' } },
      },
    });
  });

  it('gives the checks each space’s, each tagged object’s and each placed actor’s tags', () => {
    const files = [
      { kind: 'space', id: 'cave', file: 'spaces/cave.json', value: CAVE },
      { kind: 'space', id: 'green', file: 'spaces/green.json', value: GREEN },
      { kind: 'prefab', id: 'cache', file: 'prefabs/cache.json', value: CACHE },
    ] as unknown as SpaceFileRead[];
    const tags = spaceTagsOf(files, new Map([['cache', CACHE]]));
    expect(tags.spaces).toEqual(
      new Map([
        ['cave', ['cave', 'dark']],
        ['green', []],
      ]),
    );
    expect(tags.objects.get('cave')?.get('stash/chest')).toEqual(['cache']);
    expect(tags.actors).toEqual(new Map([['wick', ['chief']]]));
  });

  it('gives E058 for tags that aren’t words once each, and for a prefab’s own', async () => {
    const compiled = await compileProject(
      memorySource({
        'project.json': JSON.stringify({ format: 1, id: 'cave', name: 'Cave', version: '0.1.0' }),
        'spaces/cave.json': JSON.stringify({
          name: 'Cave',
          tags: ['cave', 'cave'],
          objects: [{ id: 'chest', shape: 'box', tags: ['Big Chest'] }],
        }),
        'prefabs/cache.json': JSON.stringify({ name: 'Cache', tags: ['cache'], objects: [] }),
      }),
      [],
    );
    expect(compiled.diagnostics.map((d) => `${d.code} ${d.file} ${d.path} ${d.message}`)).toEqual([
      'E058 prefabs/cache.json /tags Only a space has tags of its own: tag a placement of the prefab',
      'E058 spaces/cave.json /objects/0/tags/0 A tag is lowercase words joined by hyphens',
      'E058 spaces/cave.json /tags A tag is listed once',
    ]);
  });
});
