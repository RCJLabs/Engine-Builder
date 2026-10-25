/**
 * The stage's world/trigger in a play (M5.8, D70), and its world/use and world/at (M5.9, D71): no
 * button asks for them, so they are never on offer, and the session lets the sim's own checks
 * decide them, as it lets no other unoffered action by.
 */
import { createGame, createRecordStore, defineModule, flagModule, sheetModule, worldModule } from '@eb/core';
import { timeKit } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { startPlay } from './play.ts';

const trail = defineModule<object>({
  id: 'trail',
  init: () => ({}),
  actions: { rest: () => {} },
  modes: { out: { actions: ['world/*', 'trail/*'] } },
});

function play() {
  const game = createGame({
    modules: [
      flagModule,
      sheetModule,
      worldModule({
        triggers: {
          trailhead: { 'cairn/zone': { effects: [{ effect: 'set-flag', flag: 'cairn-seen', to: true }], once: true } },
        },
        uses: { trailhead: { rope: { label: 'Take', effects: [], takes: true } } },
        spawns: { trailhead: [] },
        start: 'trailhead',
        actors: {},
      }),
      trail,
    ],
    start: 'out',
  });
  const sim = { content: createRecordStore({ flag: { 'cairn-seen': {} } }) };
  return startPlay({ game, sim, kits: [], wants: { facts: [], conditions: [] } }, 'seed');
}

describe('the stage’s trigger in a play', () => {
  it('is never on offer, and is taken when the sim takes it, refused when it refuses', () => {
    const p = play();
    expect(p.view.offered).toEqual([{ type: 'trail/rest' }]);
    expect(p.act({ type: 'world/trigger', space: 'trailhead', object: 'cairn/zone' }).accepted).toBe(true);
    // Once: the sim refuses it the second time, and a zone it hasn't, and the session says so.
    expect(p.act({ type: 'world/trigger', space: 'trailhead', object: 'cairn/zone' }).accepted).toBe(false);
    expect(p.act({ type: 'world/trigger', space: 'trailhead', object: 'nowhere' }).accepted).toBe(false);
  });

  it('takes the stage’s use and where it stood the same way', () => {
    const p = play();
    expect(p.act({ type: 'world/use', space: 'trailhead', object: 'rope' }).accepted).toBe(true);
    expect(p.act({ type: 'world/use', space: 'trailhead', object: 'rope' }).accepted).toBe(false);
    expect(p.act({ type: 'world/at', space: 'trailhead', feet: [1, 0, 2], yaw: 90 }).accepted).toBe(true);
    expect(p.act({ type: 'world/at', space: 'moor', feet: [1, 0, 2], yaw: 90 }).accepted).toBe(false);
  });

  it('shows the stage where the player is, where they stood and what is taken', () => {
    const p = play();
    expect(p.view.world).toEqual({ space: 'trailhead', taken: [] });
    p.act({ type: 'world/use', space: 'trailhead', object: 'rope' });
    const stood = p.act({ type: 'world/at', space: 'trailhead', feet: [1, 0, 2], yaw: 90 });
    expect(stood.view.world).toEqual({
      space: 'trailhead',
      at: { space: 'trailhead', feet: [1, 0, 2], yaw: 90 },
      taken: ['trailhead/rope'],
    });
  });

  it('lets no other unoffered action by', () => {
    expect(play().act({ type: 'trail/unknown' }).accepted).toBe(false);
  });
});

describe('the clock while walking (M6.3)', () => {
  const ticking = (actions: string[]) => {
    const walk = defineModule<object>({ id: 'walk', init: () => ({}), modes: { out: { actions } } });
    const world = worldModule({ triggers: {}, uses: {}, spawns: { green: [] }, start: 'green', actors: {} });
    const time = timeKit({ ticksPerDay: 1440 }, { rate: 60 });
    const game = createGame({ modules: [time, world, walk], start: 'out' });
    return startPlay(
      { game, sim: { content: createRecordStore({}) }, kits: ['time'], wants: { facts: [], conditions: [] } },
      's',
    );
  };

  it('tells the stage to send time/elapse while the mode allows it, which it lets by', () => {
    const p = ticking(['world/*', 'time/*']);
    expect(p.view.world).toEqual({ space: 'green', taken: [], clock: true });
    expect(p.view.offered).toEqual([{ type: 'time/advance' }]);
    expect(p.act({ type: 'time/elapse', ms: 1000 }).accepted).toBe(true);
    expect((p.state.time as { tick: number }).tick).toBe(1);
  });

  it('says nothing of a clock the mode doesn’t run', () => {
    expect(ticking(['world/*']).view.world).toEqual({ space: 'green', taken: [] });
  });
});
