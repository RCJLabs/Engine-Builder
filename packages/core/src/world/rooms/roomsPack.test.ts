/**
 * Format 19 (M7.3, D85, docs/specs/rooms.md#the-pack): a space's building packed, checked as it is read,
 * and the world module's `world.room` on it, a placed actor standing where its NPC last arrived.
 */
import { describe, expect, it } from 'vitest';
import { packed, SHIP } from '../../../test/tileMaps.ts';
import { TOWER } from '../../../test/towers.ts';
import { canonicalJson } from '../../canonical.ts';
import { createPack, readPack } from '../../pack.ts';
import { createRecordStore } from '../../records.ts';
import { createGame, defineModule, type GameState } from '../../sim/index.ts';
import type { PackWorld } from '../packWorld.ts';
import { mapTextTiles } from '../tiles/mapText.ts';
import { type WorldData, worldModule } from '../world.ts';
import type { PackBuilding } from './building.ts';

const project = { id: 'tower', name: 'Tower', version: '0.1.0' };
const reloaded = (value: unknown): Record<string, unknown> => JSON.parse(canonicalJson(value));

const world = (buildings?: Record<string, PackBuilding>, more: Partial<PackWorld> = {}): PackWorld => ({
  spaces: { tower: { name: 'Tower', view: '2d', objects: [] }, deck: { name: 'Deck', view: '2d', objects: [] } },
  prefabs: {},
  triggers: {},
  files: {},
  records: {},
  fields: {},
  uses: {},
  spawns: { tower: [], deck: [] },
  start: 'tower',
  ...(buildings !== undefined ? { buildings } : {}),
  ...more,
});
const pack = (given: PackWorld) => createPack(project, {}, undefined, undefined, undefined, undefined, given);
const DECK = packed(
  mapTextTiles(SHIP).map((row) => row.padEnd(11, ' ')),
  SHIP,
);

describe('format 19', () => {
  it('is a pack with a building, read back as written; a 2D space with none stays format 17', () => {
    const built = pack(world({ tower: TOWER }));
    expect(built.format).toBe(19);
    expect(built.world?.buildings?.tower).toEqual(TOWER);
    expect(readPack(reloaded(built))).toEqual(reloaded(built));
    expect(pack(world()).format).toBe(17);
    expect(pack(world({})).format).toBe(17);
    expect(pack(world({})).world).not.toHaveProperty('buildings');
    // A tilemap's pack with no building is format 18, and carries no buildings it can't hold.
    const tiled = pack(world({}, { tiles: { deck: DECK } }));
    expect(tiled.format).toBe(18);
    expect(tiled.world).not.toHaveProperty('buildings');
    // A tilemap in one space and a building in another.
    const both = pack(world({ tower: TOWER }, { tiles: { deck: DECK } }));
    expect(both.format).toBe(19);
    expect(readPack(reloaded(both))).toEqual(reloaded(both));
  });

  it('refuses a building before format 19, and one that is not whole', () => {
    const read = reloaded(pack(world({ tower: TOWER })));
    expect(() => readPack({ ...read, format: 18 })).toThrow('Unknown pack world fields: buildings');
    const broken = (change: Partial<Record<keyof PackBuilding, unknown>>, space = 'tower') => {
      const buildings = { [space]: { ...TOWER, ...change } };
      return () => readPack(reloaded({ ...read, world: { ...(read.world as object), buildings } }));
    };
    expect(broken({}, 'galley')).toThrow('A building of a space the pack lacks: "galley"');
    expect(broken({ slots: 33 })).toThrow('its slots are not a whole number from 1 to 32');
    expect(broken({ floors: 0 })).toThrow('its floors are not a whole number from 1 to 64');
    expect(broken({ climb: 0.5 })).toThrow('its climb is not a whole number from 1');
    expect(broken({ slot: [48, 0] })).toThrow('its slot is not two whole sizes');
    expect(broken({ rooms: { ...TOWER.rooms, hall: [1, 1, 2] } })).toThrow('the room "hall" is not on the building');
    // Ids are read in canonical order, so the store is the one found on a taken slot.
    expect(broken({ rooms: { ...TOWER.rooms, nook: [0, 1, 1] } })).toThrow('the room "store" is on another\'s slot');
    expect(broken({ rooms: { ...TOWER.rooms, watch: [4, 0, 1] } })).toThrow('the room "watch" is not on the building');
    expect(broken({ stairs: [[3, 12]] })).toThrow('stair 0 is not on the building');
    expect(broken({ stairs: [[0, 96]] })).toThrow('stair 0 is not on the building');
    expect(broken({ places: { bell: [1, 96] } })).toThrow('"bell" is not on the building');
    expect(broken({ places: { bell: [4, 0] } })).toThrow('"bell" is not on the building');
    expect(broken({ object: 'tower', extra: 1 } as never)).toThrow('unknown fields: extra');
    const tiled = { ...read, world: { ...(read.world as object), tiles: { tower: DECK } } };
    expect(() => readPack(reloaded(tiled))).toThrow('"tower" has a building and a tilemap');
    const none = { ...read, world: { ...(read.world as object), buildings: {} } };
    expect(() => readPack(reloaded(none))).toThrow('A format 19 pack has no building');
  });
});

const DATA: WorldData = {
  triggers: {},
  uses: { tower: { bell: { label: 'Ring', effects: [{ effect: 'walk-to', actor: 'warden', to: 'crypt' }] } } },
  spawns: { tower: [] },
  start: 'tower',
  actors: { warden: { space: 'tower', path: 'warden' } },
  buildings: { tower: TOWER },
};

function play() {
  const tower = defineModule<object>({ id: 'tower', init: () => ({}), modes: { out: { actions: ['world/*'] } } });
  const game = createGame({ modules: [worldModule(DATA), tower], start: 'out' });
  const sim = { content: createRecordStore({}) };
  let state: GameState = game.init('seed', sim);
  return {
    fact: (id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    /** The warden sent to the crypt, and the stage telling the sim they arrived. */
    arrive: () => {
      for (const action of [
        { type: 'world/use', space: 'tower', object: 'bell' },
        { type: 'world/npcs-at', space: 'tower', npcs: { warden: { feet: [0, 0, 0], yaw: 0, arrived: 'crypt' } } },
      ]) {
        const stepped = game.reduce(state, action as never, sim);
        expect(stepped.accepted).toBe(true);
        state = stepped.state;
      }
    },
  };
}

describe('world.room', () => {
  it('is the room an object stands in, or "" on a bare slot, off the building or with none', () => {
    const p = play();
    expect(p.fact('world.room', { space: 'tower', of: 'bell' })).toBe('hall');
    expect(p.fact('world.room', { space: 'tower', of: 'watch' })).toBe('watch');
    expect(p.fact('world.room', { of: 'crypt' })).toBe('crypt');
    expect(p.fact('world.room', { space: 'tower', of: 'nowhere' })).toBe('');
    expect(p.fact('world.room', { space: 'deck', of: 'bell' })).toBe('');
    expect(p.fact('world.room', { space: 'tower' })).toBe('');
  });

  it('puts a placed actor where its NPC last arrived', () => {
    const p = play();
    expect(p.fact('world.room', { space: 'tower', of: 'warden' })).toBe('chapel');
    p.arrive();
    expect(p.fact('world.room', { space: 'tower', of: 'warden' })).toBe('crypt');
  });
});
