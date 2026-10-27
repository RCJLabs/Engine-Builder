/**
 * Format 18 (M7.2, D84, docs/specs/tilemaps.md#the-pack): a space's tilemap packed, checked as it is
 * read, and the world module's facts on it: whether one object sees another, and the cover one has
 * against another, a placed actor standing where its NPC last arrived.
 */
import { describe, expect, it } from 'vitest';
import { packed, SHIP } from '../../../test/tileMaps.ts';
import { canonicalJson } from '../../canonical.ts';
import { createPack, readPack } from '../../pack.ts';
import { createRecordStore } from '../../records.ts';
import { createGame, defineModule, type GameState } from '../../sim/index.ts';
import type { PackWorld } from '../packWorld.ts';
import { type WorldData, worldModule } from '../world.ts';
import type { PackTiles } from './grid.ts';
import { mapTextTiles } from './mapText.ts';

const project = { id: 'deck', name: 'Deck', version: '0.1.0' };
const reloaded = (value: unknown): Record<string, unknown> => JSON.parse(canonicalJson(value));

// The ship with its bridge console's front, the hatch's tile inside it and a crew member placed in the hold.
const DECK: PackTiles = packed(
  mapTextTiles(SHIP).map((row) => row.padEnd(11, ' ')),
  SHIP,
  { bridge: [9, 1], hatch: [5, 3], hold: [5, 0], ines: [9, 2], aft: [2, 4] },
);

const world = (tiles?: Record<string, PackTiles>): PackWorld => ({
  spaces: { deck: { name: 'Deck', view: '2d', objects: [] } },
  prefabs: {},
  triggers: {},
  files: {},
  records: {},
  fields: {},
  uses: {},
  spawns: { deck: [] },
  start: 'deck',
  ...(tiles !== undefined ? { tiles } : {}),
});
const pack = (given: PackWorld) => createPack(project, {}, undefined, undefined, undefined, undefined, given);

describe('format 18', () => {
  it('is a pack with a tilemap, read back as written; a 2D space with none stays format 17', () => {
    const tiled = pack(world({ deck: DECK }));
    expect(tiled.format).toBe(18);
    expect(tiled.world?.tiles?.deck).toEqual(DECK);
    expect(readPack(reloaded(tiled))).toEqual(reloaded(tiled));
    expect(pack(world()).format).toBe(17);
    expect(pack(world({})).format).toBe(17);
    expect(pack(world({})).world).not.toHaveProperty('tiles');
  });

  it('refuses a tilemap before format 18, and one that is not whole', () => {
    const read = reloaded(pack(world({ deck: DECK })));
    expect(() => readPack({ ...read, format: 17 })).toThrow('Unknown pack world fields: tiles');
    const broken = (change: Partial<Record<keyof PackTiles, unknown>>, space = 'deck') => {
      const tiles = { [space]: { ...DECK, ...change } };
      return () => readPack(reloaded({ ...read, world: { ...(read.world as object), tiles } }));
    };
    expect(broken({}, 'galley')).toThrow('A tilemap of a space the pack lacks: "galley"');
    expect(broken({ cells: DECK.cells.slice(1) })).toThrow('its cells are not a hexadecimal digit for each');
    expect(broken({ cells: DECK.cells.map((row) => row.replace('1', 'x')) })).toThrow('its cells');
    expect(broken({ edges: DECK.edges.slice(1) })).toThrow('its edges are not map text of its size');
    expect(broken({ size: [0, 5] })).toThrow('its size is not two whole numbers from 1 to 256');
    expect(broken({ places: { hold: [11, 0] } })).toThrow('"hold" is not on the map');
    const none = { ...read, world: { ...(read.world as object), tiles: {} } };
    expect(() => readPack(reloaded(none))).toThrow('A format 18 pack has no tilemap');
  });
});

const DATA: WorldData = {
  triggers: {},
  uses: { deck: { bridge: { label: 'Send', effects: [{ effect: 'walk-to', actor: 'ines', to: 'hold' }] } } },
  spawns: { deck: [] },
  start: 'deck',
  actors: { ines: { space: 'deck', path: 'ines' } },
  tiles: { deck: DECK },
};

function play() {
  const deck = defineModule<object>({ id: 'deck', init: () => ({}), modes: { out: { actions: ['world/*'] } } });
  const game = createGame({ modules: [worldModule(DATA), deck], start: 'out' });
  const sim = { content: createRecordStore({}) };
  let state: GameState = game.init('seed', sim);
  return {
    fact: (id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    /** Ines sent to the hold, and the stage telling the sim she arrived. */
    arrive: () => {
      for (const action of [
        { type: 'world/use', space: 'deck', object: 'bridge' },
        { type: 'world/npcs-at', space: 'deck', npcs: { ines: { feet: [0, 0, 0], yaw: 0, arrived: 'hold' } } },
      ]) {
        const stepped = game.reduce(state, action as never, sim);
        expect(stepped.accepted).toBe(true);
        state = stepped.state;
      }
    },
  };
}

describe('the facts', () => {
  it('see along the ship and not through its walls, the same both ways', () => {
    const p = play();
    expect(p.fact('world.sees', { space: 'deck', from: 'bridge', to: 'ines' })).toBe(true);
    expect(p.fact('world.sees', { space: 'deck', from: 'hatch', to: 'aft' })).toBe(false);
    expect(p.fact('world.sees', { space: 'deck', from: 'aft', to: 'hatch' })).toBe(false);
    // Off the map, a space with no tilemap, or no object named: nothing is seen.
    expect(p.fact('world.sees', { space: 'deck', from: 'bridge', to: 'nowhere' })).toBe(false);
    expect(p.fact('world.sees', { space: 'galley', from: 'bridge', to: 'ines' })).toBe(false);
    expect(p.fact('world.sees', { from: 'bridge', to: 'ines' })).toBe(true);
  });

  it('put a placed actor where its NPC last arrived', () => {
    const p = play();
    // Placed at (9, 2), in the bridge's room: the wall on her west faces the hold.
    expect(p.fact('world.cover', { space: 'deck', at: 'ines', from: 'hold' })).toBe('full');
    expect(p.fact('world.sees', { space: 'deck', from: 'ines', to: 'bridge' })).toBe(true);
    p.arrive();
    expect(p.fact('world.sees', { space: 'deck', from: 'ines', to: 'hatch' })).toBe(
      p.fact('world.sees', { space: 'deck', from: 'hold', to: 'hatch' }),
    );
    expect(p.fact('world.cover', { space: 'deck', at: 'ines', from: 'bridge' })).toBe(
      p.fact('world.cover', { space: 'deck', at: 'hold', from: 'bridge' }),
    );
  });

  it('give cover from what stands on the side facing the other', () => {
    const p = play();
    // The hold's crates (h) are west of its floor at (5, 0); the hull is above it.
    expect(p.fact('world.cover', { space: 'deck', at: 'hold', from: 'aft' })).toBe('half');
    expect(p.fact('world.cover', { space: 'deck', at: 'hold', from: 'hatch' })).toBe('none');
    expect(p.fact('world.cover', { space: 'deck', at: 'nowhere', from: 'hatch' })).toBe('none');
  });
});
