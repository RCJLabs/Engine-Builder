/**
 * The world module at version 4 (M6.3, D75, docs/specs/ai.md#the-world-module-at-version-4): follow
 * sends a placed actor after the player and stand stops it, turned to them or not; walk-to, follow
 * and stand each replace the others. A version 3 slice loads as it was.
 */
import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { createGame, defineModule, type Effect, type GameState } from '../sim/index.ts';
import { FOLLOW_M } from './npcs.ts';
import { type WorldData, type WorldSlice, worldModule } from './world.ts';

const effects = (...list: Effect[]) => ({ label: 'Do', effects: list });

const WORLD: WorldData = {
  triggers: {},
  uses: {
    square: {
      whistle: effects({ effect: 'follow', actor: 'dog' }),
      far: effects({ effect: 'follow', actor: 'dog', distance: 4.257 }),
      halt: effects({ effect: 'stand', actor: 'dog', facing: 'player' }),
      sit: effects({ effect: 'stand', actor: 'dog' }),
      fetch: effects({ effect: 'walk-to', actor: 'dog', to: 'stick' }),
      stranger: effects({ effect: 'follow', actor: 'stranger' }),
      close: effects({ effect: 'follow', actor: 'dog', distance: 0 }),
      stare: effects({ effect: 'stand', actor: 'dog', facing: 'well' }),
    },
  },
  spawns: { square: [] },
  start: 'square',
  actors: { dog: { space: 'square', path: 'dog' } },
};

const square = defineModule<object>({ id: 'square', init: () => ({}), modes: { out: { actions: ['world/*'] } } });

function play() {
  const game = createGame({ modules: [worldModule(WORLD), square], start: 'out' });
  const sim = { content: createRecordStore({}) };
  let state: GameState = game.init('seed', sim);
  const act = (action: Record<string, unknown>) => {
    const step = game.reduce(state, action as never, sim);
    state = step.state;
    return step;
  };
  return {
    use: (object: string) => act({ type: 'world/use', space: 'square', object }),
    at: (npcs: unknown) => act({ type: 'world/npcs-at', space: 'square', npcs }),
    dog: () => (state.world as WorldSlice).npcs.dog,
    fact: (id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    game,
    sim,
  };
}

describe('follow and stand', () => {
  it('sends an NPC after the player, 2 m off unless told, to the centimetre', () => {
    const p = play();
    expect(p.use('whistle').accepted).toBe(true);
    expect(p.dog()).toEqual({ space: 'square', follow: FOLLOW_M });
    p.use('far');
    expect(p.dog()).toEqual({ space: 'square', follow: 4.26 });
  });

  it('stops it where it is, facing the player when told, keeping where it last arrived', () => {
    const p = play();
    p.use('fetch');
    p.at({ dog: { feet: [1, 0, 2], yaw: 90, arrived: 'stick' } });
    expect(p.fact('world.npc-at', { actor: 'dog' })).toBe('stick');
    p.use('halt');
    expect(p.dog()).toEqual({ space: 'square', feet: [1, 0, 2], yaw: 90, arrived: 'stick', facing: 'player' });
    p.use('sit');
    expect(p.dog()).toEqual({ space: 'square', feet: [1, 0, 2], yaw: 90, arrived: 'stick' });
  });

  it('lets each replace the others', () => {
    const p = play();
    p.use('halt');
    p.use('whistle');
    expect(p.dog()).toEqual({ space: 'square', follow: 2 });
    p.use('fetch');
    expect(p.dog()).toEqual({ space: 'square', goal: 'stick' });
    p.use('far');
    expect(p.dog()).toEqual({ space: 'square', follow: 4.26 });
    p.use('halt');
    expect(p.dog()).toEqual({ space: 'square', facing: 'player' });
  });

  it('hears no arrival for a follower: it has no goal to arrive at', () => {
    const p = play();
    p.use('whistle');
    const step = p.at({ dog: { feet: [1, 0, 2], yaw: 90, arrived: 'stick' } });
    expect(step.beats.some((b) => b.type === 'world/npc-arrived')).toBe(false);
    expect(p.dog()).toEqual({ space: 'square', feet: [1, 0, 2], yaw: 90, follow: 2 });
  });

  it('throws for an actor placed nowhere, a distance of none and a facing other than the player', () => {
    // E079 keeps these from content, as walk-to's; a script's own effect can still write them.
    const p = play();
    expect(() => p.use('stranger')).toThrow('follow: no actor placed in a space: "stranger"');
    expect(() => p.use('close')).toThrow('follow: a distance is metres, more than 0: 0');
    expect(() => p.use('stare')).toThrow('stand: it faces only "player": well');
    expect(p.dog()).toBeUndefined();
  });

  it('says which space each placed actor stands in', () => {
    const p = play();
    expect(p.fact('world.npc-space', { actor: 'dog' })).toBe('square');
    expect(p.fact('world.npc-space', { actor: 'stranger' })).toBeUndefined();
  });

  it('loads a version 3 slice as it was', () => {
    const { game, sim } = play();
    const fresh = game.init('seed', sim);
    const old = {
      ...fresh,
      kernel: { ...fresh.kernel, versions: { ...fresh.kernel.versions, world: 3 } },
      world: { fired: [], taken: [], space: 'square', npcs: { dog: { space: 'square', goal: 'stick' } } },
    };
    const { state, report } = game.migrate(JSON.parse(JSON.stringify(old)), sim);
    expect(report.migrated).toEqual([{ module: 'world', from: 3, to: 5 }]);
    expect((state.world as WorldSlice).npcs).toEqual({ dog: { space: 'square', goal: 'stick' } });
  });
});
