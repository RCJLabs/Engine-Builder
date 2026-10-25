/**
 * The world module's NPCs (M6.2, D74, docs/specs/navigation.md#goals-and-arrivals): walk-to gives a
 * placed actor a goal, world/npcs-at is the stage saying where each stands, and an arrival at the
 * goal is world/npc-arrived, which a sheet's row can wait on.
 */
import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { flagModule } from '../sheets/flags.ts';
import { sheetModule } from '../sheets/sheets.ts';
import { createGame, defineModule, type GameState } from '../sim/index.ts';
import { type WorldData, type WorldSlice, worldModule } from './world.ts';

const WORLD: WorldData = {
  triggers: {},
  uses: {
    square: {
      carter: { label: 'Talk', effects: [{ effect: 'walk-to', actor: 'carter', to: 'well' }] },
      gate: { label: 'Open', effects: [{ effect: 'walk-to', actor: 'carter', to: 'gate/post' }] },
      'inn-door': { label: 'Open', effects: [{ effect: 'enter-space', space: 'inn' }] },
      // E079 keeps these from content; a script can still write them.
      stranger: { label: 'Talk', effects: [{ effect: 'walk-to', actor: 'stranger', to: 'well' }] },
      nowhere: { label: 'Talk', effects: [{ effect: 'walk-to', actor: 'carter', to: '' }] },
    },
  },
  spawns: { square: [], inn: [] },
  start: 'square',
  actors: { carter: { space: 'square', path: 'carter' }, keeper: { space: 'inn', path: 'bar/keeper' } },
};

const SHEETS = {
  carts: {
    rows: [
      {
        id: 'home',
        when: { event: 'world/npc-arrived', args: { actor: 'carter', at: 'well' } },
        do: [{ effect: 'set-flag', flag: 'watered', to: true }],
      },
    ],
  },
};

const square = defineModule<object>({ id: 'square', init: () => ({}), modes: { out: { actions: ['world/*'] } } });

function play() {
  const game = createGame({ modules: [flagModule, sheetModule, worldModule(WORLD), square], start: 'out' });
  const sim = { content: createRecordStore({ flag: { watered: {} }, sheet: SHEETS }) };
  let state: GameState = game.init('seed', sim);
  const act = (action: Record<string, unknown>) => {
    const step = game.reduce(state, action as never, sim);
    state = step.state;
    return step;
  };
  return {
    use: (object: string) => act({ type: 'world/use', space: 'square', object }),
    npcsAt: (npcs: unknown, space = 'square') => act({ type: 'world/npcs-at', space, npcs }),
    get world() {
      return state.world as WorldSlice;
    },
    fact: (id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    options: () => game.options(state, sim),
  };
}

const refused = (reason: string, more = {}) => [{ type: 'rejected', action: 'world/npcs-at', reason, ...more }];

describe('walk-to', () => {
  it('gives the actor a goal in the space it was placed in, and nobody else moves', () => {
    const p = play();
    expect(p.world.npcs).toEqual({});
    expect(p.use('carter').accepted).toBe(true);
    expect(p.world.npcs).toEqual({ carter: { space: 'square', goal: 'well' } });
    expect(p.fact('world.npc-at', { actor: 'carter' })).toBeUndefined();
  });

  it('throws for an actor placed nowhere or no object to walk to', () => {
    const p = play();
    expect(() => p.use('stranger')).toThrow(/walk-to: no actor placed in a space: "stranger"/);
    expect(() => p.use('nowhere')).toThrow(/walk-to: no object to walk to/);
  });
});

describe('world/npcs-at', () => {
  it('keeps where each NPC stands, to the centimetre and the tenth of a degree, its goal kept', () => {
    const p = play();
    p.use('carter');
    const step = p.npcsAt({ carter: { feet: [1.236, 0.004, -2.5], yaw: -90.04 } });
    expect(step.accepted).toBe(true);
    expect(step.beats).toEqual([]);
    expect(p.world.npcs.carter).toEqual({ space: 'square', goal: 'well', feet: [1.24, 0, -2.5], yaw: 270 });
  });

  it('raises world/npc-arrived at the goal, which a sheet hears, and the fact says where', () => {
    const p = play();
    p.use('carter');
    const step = p.npcsAt({ carter: { feet: [4, 0, 4], yaw: 45, arrived: 'well' } });
    expect(step.beats).toEqual([
      { type: 'world/npc-arrived', actor: 'carter', at: 'well' },
      { type: 'sheet/fired', sheet: 'carts', row: 'home' },
      { type: 'flag/changed', flag: 'watered' },
    ]);
    expect(p.world.npcs.carter).toEqual({ space: 'square', feet: [4, 0, 4], yaw: 45, arrived: 'well' });
    expect(p.fact('world.npc-at', { actor: 'carter' })).toBe('well');
    expect(p.fact('flag.on', { flag: 'watered' })).toBe(true);
    // Said again, it isn't a second arrival: the goal is spent.
    expect(p.npcsAt({ carter: { feet: [4, 0, 4], yaw: 45, arrived: 'well' } }).beats).toEqual([]);
    // Sent on, it is walking again, and where it last arrived is forgotten.
    p.use('gate');
    expect(p.world.npcs.carter).toEqual({ space: 'square', feet: [4, 0, 4], yaw: 45, goal: 'gate/post' });
    expect(p.fact('world.npc-at', { actor: 'carter' })).toBeUndefined();
  });

  it('hears no arrival at an older goal, or with none: the stage is a step behind', () => {
    const p = play();
    expect(p.npcsAt({ carter: { feet: [0, 0, 0], yaw: 0, arrived: 'well' } }).beats).toEqual([]);
    expect(p.world.npcs.carter).toEqual({ space: 'square', feet: [0, 0, 0], yaw: 0 });
    p.use('carter');
    p.use('gate');
    expect(p.npcsAt({ carter: { feet: [4, 0, 4], yaw: 0, arrived: 'well' } }).beats).toEqual([]);
    expect(p.world.npcs.carter?.goal).toBe('gate/post');
  });

  it('refuses a space the player isn’t in, an NPC of another space or none, and stands that aren’t one', () => {
    const p = play();
    const stand = { feet: [0, 0, 0], yaw: 0 };
    expect(p.npcsAt({ keeper: stand }, 'inn').beats).toEqual(refused('elsewhere', { space: 'inn' }));
    expect(p.npcsAt({ keeper: stand }).beats).toEqual(refused('no-npc', { actor: 'keeper' }));
    expect(p.npcsAt({ constructor: stand }).beats).toEqual(refused('no-npc', { actor: 'constructor' }));
    for (const bad of [
      { feet: [0, 0], yaw: 0 },
      { feet: [0, 0, '0'], yaw: 0 },
      { feet: [0, 0, 0] },
      { feet: [0, 0, 0], yaw: 0, arrived: 3 },
      'here',
    ]) {
      expect(p.npcsAt({ carter: bad }).beats).toEqual(refused('bad-npcs-at', { actor: 'carter' }));
    }
    expect(p.npcsAt([stand]).beats).toEqual(refused('bad-npcs-at'));
    // One bad stand refuses them all: the good one beside it isn't kept.
    expect(p.npcsAt({ carter: stand, keeper: stand }).accepted).toBe(false);
    expect(p.world.npcs).toEqual({});
    // In the inn, the keeper's stand is heard and the carter's is not.
    p.use('inn-door');
    expect(p.npcsAt({ keeper: stand }, 'inn').accepted).toBe(true);
    expect(p.npcsAt({ carter: stand }, 'inn').beats).toEqual(refused('no-npc', { actor: 'carter' }));
    expect(p.world.npcs).toEqual({ keeper: { space: 'inn', ...stand } });
  });

  it('is never on offer: only the stage sends it', () => {
    expect(
      play()
        .options()
        .filter((o) => o.type.startsWith('world/')),
    ).toEqual([]);
  });
});
