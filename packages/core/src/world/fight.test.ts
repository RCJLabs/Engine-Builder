/**
 * The world module at version 5 (M6.4, D76, docs/specs/combat.md#an-npc-fighting): attack sends a
 * placed actor at the player, the first two sent engaged and the rest waiting their turn; fall puts
 * one down, its goals gone and no goal effect moving it after, until rise stands it up (M6.10). A
 * version 4 slice loads as it was.
 */
import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { createGame, defineModule, type Effect, type GameState } from '../sim/index.ts';
import { ENGAGED_MOST } from './npcs.ts';
import { type WorldData, type WorldSlice, worldModule } from './world.ts';

const effects = (...list: Effect[]) => ({ label: 'Do', effects: list });
const BANDITS = ['rook', 'crow', 'wren'];

const WORLD: WorldData = {
  triggers: {},
  uses: {
    camp: {
      alarm: effects(...BANDITS.map((actor) => ({ effect: 'attack', actor }))),
      'rook-falls': effects({ effect: 'fall', actor: 'rook' }),
      'rook-again': effects({ effect: 'attack', actor: 'rook' }),
      'crow-home': effects({ effect: 'walk-to', actor: 'crow', to: 'tent' }),
      'rook-home': effects({ effect: 'walk-to', actor: 'rook', to: 'tent' }),
      'rook-follow': effects({ effect: 'follow', actor: 'rook' }),
      'rook-stand': effects({ effect: 'stand', actor: 'rook', facing: 'player' }),
      'crow-again': effects({ effect: 'attack', actor: 'crow' }),
      'rook-rises': effects({ effect: 'rise', actor: 'rook' }),
      // Rook's own path: a Talk, as the compiler makes one for an actor with a talk.
      rook: { label: 'Talk', effects: [] },
    },
  },
  spawns: { camp: [] },
  start: 'camp',
  actors: Object.fromEntries(BANDITS.map((actor) => [actor, { space: 'camp', path: actor }])),
};

const camp = defineModule<object>({ id: 'camp', init: () => ({}), modes: { out: { actions: ['world/*'] } } });

function play(start?: GameState) {
  const game = createGame({ modules: [worldModule(WORLD), camp], start: 'out' });
  const sim = { content: createRecordStore({}) };
  let state: GameState = start ?? game.init('seed', sim);
  const act = (action: Record<string, unknown>) => {
    const step = game.reduce(state, action as never, sim);
    state = step.state;
    return step;
  };
  const fact = (id: string, actor: string) => game.fact(state, `world.${id}`, { actor }, sim);
  return {
    use: (object: string) => act({ type: 'world/use', space: 'camp', object }),
    at: (npcs: unknown) => act({ type: 'world/npcs-at', space: 'camp', npcs }),
    npcs: () => (state.world as WorldSlice).npcs,
    engaged: () => BANDITS.filter((actor) => fact('npc-engaged', actor) === true),
    down: (actor: string) => fact('npc-down', actor),
    game,
    sim,
  };
}

describe('attack', () => {
  it('sends each at the player in turn, the first two engaged and the third circling', () => {
    const p = play();
    expect(p.use('alarm').accepted).toBe(true);
    expect(p.npcs()).toEqual({
      rook: { space: 'camp', fight: 1 },
      crow: { space: 'camp', fight: 2 },
      wren: { space: 'camp', fight: 3 },
    });
    expect(ENGAGED_MOST).toBe(2);
    expect(p.engaged()).toEqual(['rook', 'crow']);
  });

  it('keeps a fighter’s turn when it is sent again, and gives up its place when sent elsewhere', () => {
    const p = play();
    p.use('alarm');
    p.use('crow-again');
    expect(p.npcs().crow?.fight).toBe(2);
    p.use('crow-home');
    expect(p.npcs().crow).toEqual({ space: 'camp', goal: 'tent' });
    expect(p.engaged()).toEqual(['rook', 'wren']);
    // Back in the fight, it waits at the back of the queue.
    p.use('crow-again');
    expect(p.npcs().crow?.fight).toBe(4);
    expect(p.engaged()).toEqual(['rook', 'wren']);
  });

  it('frees a fallen fighter’s place for the next in the queue', () => {
    const p = play();
    p.use('alarm');
    p.use('rook-falls');
    expect(p.down('rook')).toBe(true);
    expect(p.npcs().rook).toEqual({ space: 'camp', down: true });
    expect(p.engaged()).toEqual(['crow', 'wren']);
  });
});

describe('fall', () => {
  it('leaves a fallen NPC where it lay: no goal, follow, stand or attack moves it', () => {
    const p = play();
    p.at({ rook: { feet: [3, 0, 4], yaw: 90 } });
    p.use('rook-falls');
    for (const object of ['rook-home', 'rook-follow', 'rook-stand', 'rook-again'])
      expect(p.use(object).accepted).toBe(true);
    expect(p.npcs().rook).toEqual({ space: 'camp', feet: [3, 0, 4], yaw: 90, down: true });
    expect(p.down('crow')).toBe(false);
  });

  it('stands an NPC up on rise, where it lay and free to walk again; down, it answers no use (M6.10)', () => {
    const p = play();
    p.at({ rook: { feet: [3, 0, 4], yaw: 90 } });
    expect(p.use('rook').accepted).toBe(true);
    p.use('rook-falls');
    expect(p.use('rook').beats).toEqual([expect.objectContaining({ reason: 'down', actor: 'rook' })]);
    expect(p.use('rook-rises').accepted).toBe(true);
    expect(p.down('rook')).toBe(false);
    expect(p.npcs().rook).toEqual({ space: 'camp', feet: [3, 0, 4], yaw: 90 });
    expect(p.use('rook').accepted).toBe(true);
    p.use('rook-home');
    expect(p.npcs().rook?.goal).toBe('tent');
  });

  it('loads a version 4 slice as it was, no one fighting or down', () => {
    const p = play();
    p.at({ rook: { feet: [1, 0, 1], yaw: 0 } });
    const fresh = play();
    const v4 = { ...fresh.game.init('seed', fresh.sim) };
    const kernel = v4.kernel as unknown as { versions: Record<string, number> };
    const old = {
      ...v4,
      kernel: { ...kernel, versions: { ...kernel.versions, world: 4 } },
      world: { ...(v4.world as WorldSlice), npcs: { rook: { space: 'camp', goal: 'tent' } } },
    } as unknown as GameState;
    const { state, report } = fresh.game.migrate(old, fresh.sim);
    expect(report.migrated).toEqual([{ module: 'world', from: 4, to: 5 }]);
    expect((state.world as WorldSlice).npcs).toEqual({ rook: { space: 'camp', goal: 'tent' } });
  });
});
