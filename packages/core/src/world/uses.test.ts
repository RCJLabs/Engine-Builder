/**
 * The world module's M5.9 half (D71, docs/specs/worldspaces.md): world/use and what it takes,
 * world/at and where the player stood, and enter-space, which moves the player between spaces.
 */
import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { flagModule } from '../sheets/flags.ts';
import { createGame, defineModule, type GameState } from '../sim/index.ts';
import { type WorldData, type WorldSlice, worldModule } from './world.ts';

const on = (flag: string) => ({ fact: 'flag.on', args: { flag } });

const WORLD: WorldData = {
  triggers: { glen: { 'bothy-door': { effects: [{ effect: 'enter-space', space: 'bothy', spawn: 'door' }] } } },
  uses: {
    glen: {
      rope: { label: 'Take', effects: [{ effect: 'add-to-flag', flag: 'ropes', by: 1 }], takes: true },
      'shed/door': { label: 'Open', effects: [{ effect: 'enter-space', space: 'shed' }] },
      cairn: { label: 'Read', effects: [{ effect: 'set-flag', flag: 'read', to: true }], once: true },
      gate: { label: 'Open', when: on('read'), effects: [{ effect: 'add-to-flag', flag: 'ropes', by: 1 }] },
      trap: {
        label: 'Take',
        effects: [{ effect: 'add-to-flag', flag: 'ropes', by: 1 }, { effect: 'toll' }],
        takes: true,
      },
    },
  },
  spawns: { glen: ['gate-spawn', 'start'], bothy: ['door'], shed: [] },
  start: 'glen',
};

const FLAGS = { read: {}, ropes: { number: { min: 0, max: 9 } } };

const glen = defineModule<object>({
  id: 'glen',
  init: () => ({}),
  effects: { toll: (ctx) => ctx.refuse('broke') },
  modes: { out: { actions: ['world/*'] } },
});

function play() {
  const game = createGame({ modules: [flagModule, worldModule(WORLD), glen], start: 'out' });
  const sim = { content: createRecordStore({ flag: FLAGS }) };
  let state: GameState = game.init('seed', sim);
  const act = (action: Record<string, unknown>) => {
    const step = game.reduce(state, action as never, sim);
    state = step.state;
    return step;
  };
  return {
    use: (space: string, object: string) => act({ type: 'world/use', space, object }),
    at: (fields: Record<string, unknown>) => act({ type: 'world/at', ...fields }),
    enter: (space: string, object: string) => act({ type: 'world/trigger', space, object }),
    get world() {
      return state.world as WorldSlice;
    },
    fact: (id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    options: () => game.options(state, sim),
  };
}

const refused = (reason: string, more = {}) => [{ type: 'rejected', action: 'world/use', reason, ...more }];

describe('world/use', () => {
  it('runs a use’s effects after world/used, and a take is kept, sorted, and can’t be taken again', () => {
    const p = play();
    const step = p.use('glen', 'rope');
    expect(step.beats).toEqual([
      { type: 'world/used', space: 'glen', object: 'rope' },
      { type: 'flag/changed', flag: 'ropes' },
    ]);
    expect(p.world.taken).toEqual(['glen/rope']);
    expect(p.fact('world.taken', { space: 'glen', object: 'rope' })).toBe(true);
    expect(p.use('glen', 'rope').beats).toEqual(refused('taken'));
    expect(p.fact('flag.number', { flag: 'ropes' })).toBe(1);
  });

  it('runs a once use once, and one with a condition only while it holds', () => {
    const p = play();
    expect(p.use('glen', 'gate').beats).toEqual(refused('unmet'));
    p.use('glen', 'cairn');
    expect(p.world.fired).toEqual(['glen/cairn']);
    expect(p.use('glen', 'cairn').beats).toEqual(refused('spent'));
    p.use('glen', 'gate');
    p.use('glen', 'gate');
    expect(p.fact('flag.number', { flag: 'ropes' })).toBe(2);
  });

  it('takes nothing when an effect refuses: the whole use is undone', () => {
    const p = play();
    expect(p.use('glen', 'trap').accepted).toBe(false);
    expect(p.world.taken).toEqual([]);
    expect(p.fact('flag.number', { flag: 'ropes' })).toBe(0);
  });

  it('refuses a use the pack lacks, own keys only, and one without its names', () => {
    const p = play();
    for (const [space, object] of [
      ['glen', 'shed'],
      ['bothy', 'rope'],
      ['glen', 'constructor'],
      ['constructor', 'rope'],
    ] as const) {
      expect(p.use(space, object).beats).toEqual(refused('no-use', { space, object }));
    }
    expect(p.use('glen', undefined as never).beats).toEqual(refused('bad-use'));
  });

  it('is never offered, and neither is world/at', () => {
    expect(
      play()
        .options()
        .filter((o) => o.type.startsWith('world/')),
    ).toEqual([]);
  });
});

describe('world/at', () => {
  it('keeps where the player stood, to the centimetre, and the way they faced, turned into 0 to 360', () => {
    const p = play();
    expect(p.at({ space: 'glen', feet: [1.23456, 0.004, -7.891], yaw: -90.04 }).accepted).toBe(true);
    expect(p.world.at).toEqual({ space: 'glen', feet: [1.23, 0, -7.89], yaw: 270 });
    p.at({ space: 'glen', feet: [0, 0, 0], yaw: 725 });
    expect(p.world.at?.yaw).toBe(5);
  });

  it('refuses feet or a yaw that aren’t three numbers and a number, and a space the player isn’t in', () => {
    const p = play();
    // NaN and the infinities have no JSON form: the kernel refuses such an action before the module sees it.
    expect(() => p.at({ space: 'glen', feet: [0, 0, Number.NaN], yaw: 0 })).toThrow(/not JSON/);
    for (const fields of [
      { space: 'glen', feet: [0, 0], yaw: 0 },
      { space: 'glen', feet: [0, 0, 0] },
      { space: 'glen', feet: [0, '1', 0], yaw: 0 },
      { space: 'glen', feet: { x: 0 }, yaw: 0 },
      { feet: [0, 0, 0], yaw: 0 },
    ]) {
      expect(p.at(fields).beats).toEqual([{ type: 'rejected', action: 'world/at', reason: 'bad-at' }]);
    }
    for (const space of ['moor', 'bothy']) {
      expect(p.at({ space, feet: [0, 0, 0], yaw: 0 }).beats).toEqual([
        { type: 'rejected', action: 'world/at', reason: 'elsewhere', space },
      ]);
    }
    expect(p.world.at).toBeUndefined();
    // Once in the bothy, the glen is elsewhere.
    p.enter('glen', 'bothy-door');
    expect(p.at({ space: 'glen', feet: [0, 0, 0], yaw: 0 }).accepted).toBe(false);
    expect(p.at({ space: 'bothy', feet: [0, 0, 0], yaw: 0 }).accepted).toBe(true);
  });
});

describe('enter-space', () => {
  it('starts in the start, then moves the player to a spawn point, where they stood forgotten', () => {
    const p = play();
    expect(p.fact('world.in', { space: 'glen' })).toBe(true);
    p.at({ space: 'glen', feet: [3, 0, 4], yaw: 10 });
    const step = p.enter('glen', 'bothy-door');
    expect(step.beats).toEqual([
      { type: 'world/entered', space: 'glen', object: 'bothy-door' },
      { type: 'world/arrived', space: 'bothy' },
    ]);
    expect(p.world).toEqual({ fired: [], taken: [], space: 'bothy', arrive: 'door' });
    expect(p.fact('world.in', { space: 'bothy' })).toBe(true);
    expect(p.fact('world.in', { space: 'glen' })).toBe(false);
  });

  it('arrives at the space’s start when it names no spawn point, from a use too', () => {
    const p = play();
    p.enter('glen', 'bothy-door');
    p.use('glen', 'shed/door');
    expect(p.world).toEqual({ fired: [], taken: [], space: 'shed' });
  });

  it('throws for a space or a spawn point the pack lacks: E076 keeps these from content', () => {
    for (const effect of [
      { effect: 'enter-space', space: 'moor' },
      { effect: 'enter-space', space: 'bothy', spawn: 'window' },
      { effect: 'enter-space', space: 'constructor' },
    ]) {
      const world = { ...WORLD, uses: { glen: { bad: { label: 'Go', effects: [effect] } } } };
      const game = createGame({ modules: [flagModule, worldModule(world), glen], start: 'out' });
      const sim = { content: createRecordStore({ flag: FLAGS }) };
      expect(() =>
        game.reduce(game.init('seed', sim), { type: 'world/use', space: 'glen', object: 'bad' }, sim),
      ).toThrow(/enter-space/);
    }
  });
});
