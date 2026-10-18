/**
 * Times events and trigger sheets in the sim kernel (M3.1): one action raising one event, with
 * nobody listening, with the sheet module listening and no rows for it, with a thousand rows for
 * other events, and with a hundred rows for it that don't match, that match but whose If is
 * false, and ten that run. Microseconds per reduce, the median of 5 rounds of 20,000. The
 * instrument behind the "Trigger sheets" readings in ROADMAP.md.
 *
 *   node packages/core/test/trigger-bench.ts
 */
import {
  createGame,
  createRecordStore,
  defineModule,
  flagModule,
  type GameState,
  type RecordPack,
  sheetModule,
} from '../src/index.ts';

const post = defineModule<Record<string, never>>({
  id: 'post',
  init: () => ({}),
  events: { rang: { args: { bell: { type: 'text' } } } },
  actions: { ring: (ctx) => ctx.emit('rang', { bell: 'front' }) },
  modes: { play: { actions: ['*'] } },
});

const row = (id: string, when: object, extra: object = {}) => ({ id, when, do: [], ...extra });
const rows = (n: number, make: (i: number) => object) => Array.from({ length: n }, (_, i) => make(i));
const FLAGS = { counter: { number: { min: 0 } }, never: {} };

const CASES: Record<string, { sheets: boolean; sheet?: RecordPack['sheet'] }> = {
  'nobody listening': { sheets: false },
  'sheets, no rows': { sheets: true },
  '1,000 rows for other events': {
    sheets: true,
    sheet: Object.fromEntries(
      rows(100, (s) => [
        `s${s}`,
        { rows: rows(10, (i) => row(`r${i}`, { event: 'flag/changed', args: { flag: 'never' } })) },
      ]),
    ),
  },
  '100 rows that do not match': {
    sheets: true,
    sheet: { bells: { rows: rows(100, (i) => row(`r${i}`, { event: 'post/rang', args: { bell: 'back' } })) } },
  },
  '100 rows whose If is false': {
    sheets: true,
    sheet: {
      bells: {
        rows: rows(100, (i) =>
          row(
            `r${i}`,
            { event: 'post/rang', args: { bell: 'front' } },
            { if: { fact: 'flag.on', args: { flag: 'never' } } },
          ),
        ),
      },
    },
  },
  '10 rows that run': {
    sheets: true,
    sheet: {
      bells: {
        rows: rows(10, (i) =>
          row(`r${i}`, { event: 'post/rang' }, { do: [{ effect: 'add-to-flag', flag: 'counter', by: 1 }] }),
        ),
      },
    },
  },
};

const ROUNDS = 5;
const REDUCES = 20_000;
const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;

for (const [name, { sheets, sheet }] of Object.entries(CASES)) {
  const game = createGame({ modules: sheets ? [post, flagModule, sheetModule] : [post], start: 'play' });
  const sim = { content: createRecordStore(sheets ? { flag: FLAGS, sheet: sheet ?? {} } : {}) };
  const times: number[] = [];
  let beats = 0;
  for (let round = 0; round < ROUNDS; round++) {
    let state: GameState = game.init('seed', sim);
    const t0 = performance.now();
    for (let i = 0; i < REDUCES; i++) {
      const step = game.reduce(state, { type: 'post/ring' }, sim);
      if (!step.accepted) throw new Error(`${name}: refused`);
      state = step.state;
      beats += step.beats.length;
    }
    times.push(((performance.now() - t0) * 1000) / REDUCES);
  }
  const each = median(times);
  console.log(`${name}: ${each.toFixed(2)} µs per reduce, ${beats / (ROUNDS * REDUCES)} beats each`);
}
