import {
  createGame,
  createRecordStore,
  defineModule,
  EMPTY_WORLD,
  type Module,
  type PackWorld,
  withPackWorld,
  worldModule,
} from '@eb/core';
import { describe, expect, it } from 'vitest';
import { KIT_IDS, KITS, kitsOn } from './kits.ts';
import { kitModules, kitsInWorld } from './modules.ts';

describe('the kits', () => {
  it('each have a module of their own id, joining a game in the engine’s order', () => {
    expect(kitModules(KIT_IDS).map((module) => module.id)).toEqual(KIT_IDS);
    expect(kitModules(['economy', 'inventory']).map((module) => module.id)).toEqual(['inventory', 'economy']);
    expect(kitModules([])).toEqual([]);
  });

  it('need only kits listed before them, so the engine’s order turns needs on first', () => {
    for (const [i, kit] of KITS.entries()) {
      for (const need of kit.needs) expect(KIT_IDS.indexOf(need)).toBeLessThan(i);
    }
  });

  it('turn on in the engine’s order, a kit whose need is off staying off (E034), an unknown or twice listed E033', () => {
    expect(kitsOn(['economy', 'inventory'])).toEqual({ on: ['inventory', 'economy'], problems: [] });
    expect(kitsOn(['economy']).on).toEqual([]);
    expect(kitsOn(['economy']).problems.map((p) => `${p.code} ${p.index}`)).toEqual(['E034 0']);
    // The roster's members are actors, so it needs the stats kit (M3.6).
    expect(kitsOn(['roster']).problems.map((p) => p.message)).toEqual(['The roster kit needs stats on too']);
    expect(kitsOn(['roster', 'stats']).on).toEqual(['stats', 'roster']);
    expect(kitsOn(['inventory', 'magic', 'inventory']).problems.map((p) => `${p.code} ${p.index}`)).toEqual([
      'E033 1',
      'E033 2',
    ]);
  });
});

describe('a game read before its world was known', () => {
  // The checking game's stand-in container (projectGame.ts), and a pack whose yard has a barrel.
  const standIn = { holding: { holding: { label: '', effects: [], holds: {} } } };
  const barrel = { label: 'Open', effects: [], holds: { bread: 2 } };
  const PACK: PackWorld = {
    spaces: { yard: {} },
    prefabs: {},
    triggers: {},
    files: {},
    records: {},
    fields: {},
    uses: { yard: { barrel } },
    spawns: { yard: [] },
    start: 'yard',
  };
  const out = defineModule<object>({ id: 'yard', init: () => ({}), modes: { out: { actions: ['world/*'] } } });
  const sim = { content: createRecordStore({ item: { bread: { name: 'Bread' } } }) };
  const opens = (modules: readonly Module[]) => {
    const game = createGame({ modules: withPackWorld(modules, PACK), start: 'out' });
    return game.reduce(game.init('yard', sim), { type: 'world/use', space: 'yard', object: 'barrel' }, sim);
  };

  it('has its inventory, built for the stand-in, built again with the pack’s containers (M6.9)', () => {
    const read = [
      ...kitModules(['inventory'], undefined, undefined, undefined, { uses: standIn }),
      worldModule(EMPTY_WORLD),
      out,
    ];
    expect(() => opens(read)).toThrow('no container "yard/barrel"');
    const step = opens(kitsInWorld(read, PACK));
    expect(step.accepted).toBe(true);
    expect(step.state.kernel.modes.at(-1)).toEqual({ id: 'container', data: { space: 'yard', object: 'barrel' } });
  });

  it('keeps a game’s own module of the kit’s id as it is', () => {
    const own = defineModule<object>({ id: 'inventory', init: () => ({}) });
    expect(kitsInWorld([own], PACK)[0]).toBe(own);
  });
});
