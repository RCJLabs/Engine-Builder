import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { flagModule } from '../sheets/flags.ts';
import { sheetModule } from '../sheets/sheets.ts';
import { createGame, defineModule, type GameState } from '../sim/index.ts';
import { type WorldData, worldModule } from './world.ts';

const on = (flag: string) => ({ fact: 'flag.on', args: { flag } });

const WORLD: WorldData = {
  triggers: {
    trailhead: {
      'cairn/zone': { effects: [{ effect: 'set-flag', flag: 'cairn-seen', to: true }], once: true },
      gate: { when: on('cairn-seen'), effects: [{ effect: 'add-to-flag', flag: 'gates', by: 1 }] },
      bog: { effects: [{ effect: 'add-to-flag', flag: 'gates', by: 1 }, { effect: 'toll' }], once: true },
      'a-stile': { effects: [], once: true },
    },
  },
  uses: {},
  spawns: { trailhead: [], bothy: [] },
  start: 'trailhead',
};

const FLAGS = { 'cairn-seen': {}, gates: { number: { min: 0, max: 5 } } };

/** A game's own module with its modes: walking counts while out, and not once it's over. */
const trail = defineModule<object>({
  id: 'trail',
  init: () => ({}),
  actions: { rest: () => {} },
  effects: { toll: (ctx) => ctx.refuse('broke') },
  modes: { out: { actions: ['world/*', 'trail/*'] }, over: { actions: [] } },
});

const gameOf = (start = 'out') => createGame({ modules: [flagModule, sheetModule, worldModule(WORLD), trail], start });

function walk(sheets = {}, start = 'out') {
  const game = gameOf(start);
  const sim = { content: createRecordStore({ flag: FLAGS, sheet: sheets }) };
  let state: GameState = game.init('seed', sim);
  return {
    enter(space: string, object: string) {
      const step = game.reduce(state, { type: 'world/trigger', space, object }, sim);
      state = step.state;
      return step;
    },
    get state() {
      return state;
    },
    fact: (id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    options: () => game.options(state, sim),
  };
}

describe('world/trigger', () => {
  it('runs a zone’s effects, with the entered event first', () => {
    const w = walk();
    const step = w.enter('trailhead', 'cairn/zone');
    expect(step.accepted).toBe(true);
    expect(step.beats).toEqual([
      { type: 'world/entered', space: 'trailhead', object: 'cairn/zone' },
      { type: 'flag/changed', flag: 'cairn-seen' },
    ]);
    expect(w.fact('flag.on', { flag: 'cairn-seen' })).toBe(true);
  });

  it('runs a once zone once, which the state remembers, sorted', () => {
    const w = walk();
    expect(w.fact('world.fired', { space: 'trailhead', object: 'cairn/zone' })).toBe(false);
    w.enter('trailhead', 'cairn/zone');
    expect(w.state.world).toEqual({ fired: ['trailhead/cairn/zone'], taken: [], space: 'trailhead' });
    expect(w.fact('world.fired', { space: 'trailhead', object: 'cairn/zone' })).toBe(true);
    const again = w.enter('trailhead', 'cairn/zone');
    expect(again.accepted).toBe(false);
    expect(again.beats).toEqual([{ type: 'rejected', action: 'world/trigger', reason: 'spent' }]);
    w.enter('trailhead', 'a-stile');
    expect(w.state.world).toEqual({
      fired: ['trailhead/a-stile', 'trailhead/cairn/zone'],
      taken: [],
      space: 'trailhead',
    });
  });

  it('runs a zone every time while its condition holds, and never while it doesn’t', () => {
    const w = walk();
    expect(w.enter('trailhead', 'gate').beats).toEqual([
      { type: 'rejected', action: 'world/trigger', reason: 'unmet' },
    ]);
    w.enter('trailhead', 'cairn/zone');
    w.enter('trailhead', 'gate');
    w.enter('trailhead', 'gate');
    expect(w.fact('flag.number', { flag: 'gates' })).toBe(2);
    // Not remembered: only once zones are.
    expect(w.state.world).toEqual({ fired: ['trailhead/cairn/zone'], taken: [], space: 'trailhead' });
  });

  it('refuses a zone the pack lacks, own keys only, and a trigger without its names', () => {
    const w = walk();
    for (const [space, object] of [
      ['trailhead', 'cairn'],
      ['bothy', 'gate'],
      ['trailhead', 'constructor'],
      ['constructor', 'gate'],
    ] as const) {
      expect(w.enter(space, object).beats).toEqual([
        { type: 'rejected', action: 'world/trigger', reason: 'no-zone', space, object },
      ]);
    }
    const game = gameOf();
    const sim = { content: createRecordStore({ flag: FLAGS }) };
    const step = game.reduce(game.init('seed', sim), { type: 'world/trigger', space: 'trailhead' }, sim);
    expect(step.beats).toEqual([{ type: 'rejected', action: 'world/trigger', reason: 'bad-trigger' }]);
  });

  it('undoes the whole zone when an effect refuses, and is not spent', () => {
    const w = walk();
    // The toll refuses, and the gate counted before it is undone with it.
    const step = w.enter('trailhead', 'bog');
    expect(step.accepted).toBe(false);
    expect(w.fact('flag.number', { flag: 'gates' })).toBe(0);
    expect(w.state.world).toEqual({ fired: [], taken: [], space: 'trailhead' });
  });

  it('is never offered: only the stage sends it', () => {
    expect(
      walk()
        .options()
        .filter((o) => o.type.startsWith('world/')),
    ).toEqual([]);
  });

  it('runs only in a mode the game allows it in', () => {
    const step = walk({}, 'over').enter('trailhead', 'cairn/zone');
    expect(step.beats).toEqual([{ type: 'rejected', action: 'world/trigger', reason: 'mode', mode: 'over' }]);
  });

  it('raises world/entered for a sheet’s rows to hear', () => {
    const w = walk({
      cairns: {
        rows: [
          {
            id: 'count',
            when: { event: 'world/entered', args: { space: 'trailhead' } },
            do: [{ effect: 'add-to-flag', flag: 'gates', by: 1 }],
          },
        ],
      },
    });
    w.enter('trailhead', 'cairn/zone');
    expect(w.fact('flag.number', { flag: 'gates' })).toBe(1);
  });
});
