/**
 * Format 16 (M6.8, D80, docs/specs/barter.md#the-pack-format-16): a use's `holds`, only when one
 * holds, so every pack without keeps its format and its hash; the containers the inventory kit is
 * built with; and world/use opening one after its effects.
 */
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../canonical.ts';
import { createPack, readPack } from '../pack.ts';
import { createRecordStore } from '../records.ts';
import { flagModule } from '../sheets/flags.ts';
import { createGame, defineModule } from '../sim/index.ts';
import { containersOf, holdsAny, holdsProblem } from './containers.ts';
import type { PackWorld } from './packWorld.ts';
import { worldModule } from './world.ts';

const project = { id: 'post', name: 'Post', version: '0.1.0' };
const records = { item: { bread: { name: 'Bread' } } };
const reloaded = (value: unknown): Record<string, unknown> => JSON.parse(canonicalJson(value));
const CHEST = { label: 'Open', effects: [], holds: { bread: 2 } };
const world = (uses: PackWorld['uses']): PackWorld => ({
  spaces: { yard: { objects: [] } },
  prefabs: {},
  triggers: {},
  files: {},
  records: {},
  fields: {},
  uses,
  spawns: { yard: [] },
  start: 'yard',
});
const pack = (given: PackWorld) => createPack(project, records, undefined, undefined, undefined, undefined, given);

describe('format 16', () => {
  it('carries a use’s holds once one holds, an empty one too', () => {
    const held = pack(world({ yard: { chest: CHEST, barrel: { label: 'Open', effects: [], holds: {} } } }));
    expect(held.format).toBe(16);
    expect(held.world?.uses?.yard?.chest).toEqual(CHEST);
    expect(readPack(reloaded(held))).toEqual(reloaded(held));
  });

  it('keeps the format and the hash of a pack with no use that holds', () => {
    const plain = pack(world({ yard: { gate: { label: 'Open', effects: [] } } }));
    expect(plain.format).toBe(10);
  });

  it('refuses holds that aren’t, and holds before format 16', () => {
    const read = reloaded(pack(world({ yard: { chest: CHEST } })));
    const withUse =
      (use: unknown, format = 16) =>
      () =>
        readPack({ ...read, format, world: { ...(read.world as object), uses: { yard: { chest: use } } } });
    expect(withUse(CHEST)).not.toThrow();
    expect(withUse({ ...CHEST, holds: [] })).toThrow(`The use "yard/chest"'s holds is not an object`);
    expect(withUse({ ...CHEST, holds: { Bread: 1 } })).toThrow(`holds "Bread", which is not an item's id`);
    expect(withUse({ ...CHEST, holds: { bread: 0 } })).toThrow('holds 0 of "bread": a whole number, 1 or more');
    expect(withUse({ ...CHEST, holds: { bread: 1.5 } })).toThrow('holds 1.5 of "bread"');
    expect(withUse({ ...CHEST, once: 'yes' })).toThrow(`The use "yard/chest"'s once is not true or false`);
    expect(withUse(CHEST, 15)).toThrow('Unknown use fields: holds');
  });

  it('lists the containers by space and object, and whether there are any', () => {
    const uses = {
      yard: { gate: { label: 'Open', effects: [] }, chest: CHEST },
      bothy: { chest: { ...CHEST, holds: {} } },
    };
    expect(holdsAny(uses)).toBe(true);
    expect(holdsAny({ yard: { gate: { label: 'Open', effects: [] } } })).toBe(false);
    expect(holdsAny(undefined)).toBe(false);
    expect(containersOf(uses)).toEqual({ 'bothy/chest': {}, 'yard/chest': { bread: 2 } });
    expect(Object.keys(containersOf(uses))).toEqual(['bothy/chest', 'yard/chest']);
    expect(holdsProblem('yard/chest', { bread: 2 })).toBeUndefined();
  });
});

describe('a use that holds', () => {
  const opened: unknown[] = [];
  const box = defineModule<object>({
    id: 'box',
    init: () => ({}),
    effects: {
      'open-container': (ctx, effect) => {
        opened.push({ space: effect.space, object: effect.object, seen: ctx.fact('flag.on', { flag: 'seen' }) });
        ctx.modes.push('container');
      },
      toll: (ctx) => ctx.refuse('broke'),
    },
    modes: { out: { actions: ['world/*'] }, container: { actions: [] } },
  });
  const uses = {
    yard: {
      chest: { label: 'Open', effects: [{ effect: 'set-flag', flag: 'seen', to: true }], holds: { bread: 2 } },
      trap: { label: 'Open', effects: [{ effect: 'toll' }], holds: {} },
    },
  };
  const game = createGame({
    modules: [flagModule, worldModule({ triggers: {}, uses, spawns: { yard: [] }, start: 'yard', actors: {} }), box],
    start: 'out',
  });
  const sim = { content: createRecordStore({ flag: { seen: {} } }) };
  const use = (object: string) =>
    game.reduce(game.init('seed', sim), { type: 'world/use', space: 'yard', object }, sim);

  it('opens the container after its effects', () => {
    opened.length = 0;
    const step = use('chest');
    expect(step.accepted).toBe(true);
    expect(opened).toEqual([{ space: 'yard', object: 'chest', seen: true }]);
    expect(step.state.kernel.modes.at(-1)?.id).toBe('container');
  });

  it('opens nothing when one of its effects refuses', () => {
    opened.length = 0;
    const step = use('trap');
    expect(step.accepted).toBe(false);
    expect(step.beats).toEqual([{ type: 'rejected', action: 'world/use', reason: 'broke' }]);
    expect(opened).toEqual([]);
  });
});
