/**
 * The stage's world/trigger in a play (M5.8, D70), and its world/use and world/at (M5.9, D71): no
 * button asks for them, so they are never on offer, and the session lets the sim's own checks
 * decide them, as it lets no other unoffered action by.
 */
import { createGame, createRecordStore, defineModule, flagModule, sheetModule, worldModule } from '@eb/core';
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

  it('lets no other unoffered action by', () => {
    expect(play().act({ type: 'trail/unknown' }).accepted).toBe(false);
  });
});
