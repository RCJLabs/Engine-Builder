/**
 * A battle against its space (M7.5, D87): E096 for a space that isn't there, a 3D space and a 2D space with
 * no tilemap, each at the battle's /space; and the actors a battle sets out, each once, which the world packs
 * for the stage to draw. The fight fixture's CLI test breaks a unit's post the other ways (fight.test.ts).
 */
import type { RecordInput } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { checkBattles, fightersOf } from './battles.ts';
import type { SpaceFileRead } from './spaces.ts';

const battle = (id: string, space: string): RecordInput => ({
  type: 'battle',
  id,
  file: `records/battle/${id}.json`,
  value: {
    rules: 'boarding',
    space,
    crew: [
      { actor: 'oren', at: 'helm' },
      { actor: 'ines', at: 'door' },
    ],
    foes: [
      { actor: 'pirate', at: 'hatch' },
      { actor: 'pirate', at: 'lock' },
    ],
  },
});

const read = (id: string, value: unknown): SpaceFileRead => ({ kind: 'space', id, file: `spaces/${id}.json`, value });
const floor = { tileset: 'deck', size: [2, 1], layers: [{ id: 'floor', rows: ['..'] }] };
const FILES = [
  read('hill', { name: 'The hill', objects: [] }),
  read('yard', { name: 'The yard', view: '2d', fit: [64, 64], size: [64, 64], objects: [] }),
  // A tilemap in a 3D space is E058's; it is still no field for a battle.
  read('barn', { name: 'The barn', objects: [{ id: 'floor', shape: 'box', components: { tilemap: floor } }] }),
];
const DECK = { sheet: 'deck.png', tile: [16, 16], tiles: { floor: { char: '.', frame: 0, walk: true } } };

describe('a battle against its space', () => {
  it('is E096 for no such space, a 3D space, with a tilemap or without, and a 2D space with none', () => {
    const found = checkBattles(
      [battle('a', 'nowhere'), battle('b', 'hill'), battle('c', 'yard'), battle('d', 'barn')],
      FILES,
      (type) => (type === 'tileset' ? DECK : undefined),
    );
    expect(found.map((d) => `${d.code} ${d.id} ${d.file} ${d.path} ${d.message}`)).toEqual([
      'E096 a records/battle/a.json /space No space "nowhere"',
      'E096 b records/battle/b.json /space hill is a 3D space: a battle is fought on a 2D space’s tilemap',
      'E096 c records/battle/c.json /space yard has no tilemap: a battle is fought on a 2D space’s tilemap',
      'E096 d records/battle/d.json /space barn is a 3D space: a battle is fought on a 2D space’s tilemap',
    ]);
  });

  it('sets out its actors, each once and sorted, for the world to pack', () => {
    expect(fightersOf([battle('a', 'yard'), { type: 'actor', id: 'sal', value: {} }, battle('b', 'hill')])).toEqual([
      'ines',
      'oren',
      'pirate',
    ]);
  });
});
