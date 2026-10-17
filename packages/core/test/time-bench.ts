/**
 * Times offline settling: one time/elapse of 8 hours, a tick a second, with 100 timers each
 * firing hourly (800 firings), then the same with 8 of them refusing every time, which makes
 * the action run again once per refusal. The instrument behind the "offline settle" reading in
 * ROADMAP.md.
 *
 *   node packages/core/test/time-bench.ts
 */
import { createGame, createRecordStore, defineModule, type Effect, timeModule } from '../src/index.ts';

const sim = { content: createRecordStore({}) };
const counter = defineModule<{ n: number }>({
  id: 'counter',
  init: () => ({ n: 0 }),
  actions: {
    apply(ctx, action) {
      for (const effect of action.effects as Effect[]) ctx.apply(effect);
    },
  },
  effects: {
    count(ctx) {
      ctx.write().n += 1;
    },
    fail(ctx) {
      ctx.refuse('no');
    },
  },
  modes: { play: { actions: ['*'] } },
});
const time = timeModule({
  calendar: { ticksPerDay: 86_400, units: { seconds: 1, hours: 3_600 } },
  realTime: { msPerTick: 1_000, maxElapseMs: 8 * 3_600_000 },
});
const game = createGame({ modules: [time, counter], start: 'play' });

for (const failing of [0, 8]) {
  const timers = Array.from({ length: 100 }, (_, i) => ({
    effect: 'schedule',
    after: { seconds: i + 1 },
    every: { hours: 1 },
    effects: [{ effect: i < failing ? 'fail' : 'count' }],
  }));
  const ready = game.reduce(game.init('bench', sim), { type: 'counter/apply', effects: timers }, sim).state;
  const started = performance.now();
  const step = game.reduce(ready, { type: 'time/elapse', ms: 8 * 3_600_000 }, sim);
  const elapsed = performance.now() - started;
  const fired = step.beats.filter((beat) => beat.type === 'time/fired').length;
  const refused = step.beats.filter((beat) => beat.type === 'time/refused').length;
  console.log(`${failing} refusing: ${fired} fired, ${refused} refused, ${elapsed.toFixed(0)} ms`);
}
