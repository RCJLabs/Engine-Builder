/**
 * Times saves on salvage run: 1,000 seeds played to their end by the test bot, each saved with
 * its whole log, then written as JSON and loaded back (checksum, migration, replay). The
 * instrument behind the "save and load" reading in ROADMAP.md.
 *
 *   node packages/core/test/save-bench.ts
 */
import { type Action, createSaveFile, createSession, loadSave } from '../src/index.ts';
import { botAction, botFor, game, sim } from './salvage.ts';

const info = { game: 'salvage-run', edition: 'bench', build: 'bench', savedAt: 0 };
let saves = 0;
let actions = 0;
let bytes = 0;
let largest = 0;
let saving = 0;
let loading = 0;
for (let i = 0; i < 1000; i++) {
  const seed = `seed-${i}`;
  const session = createSession(game, sim, game.init(seed, sim));
  const bot = botFor(seed);
  for (let n = 0; n < 400; n++) {
    const action = botAction(session.state, game.allowedActions(session.state), bot);
    if (!action) break;
    session.dispatch(action as Action);
  }
  const t0 = performance.now();
  const text = JSON.stringify(
    createSaveFile({ snapshot: session.start, log: session.log, state: session.state }, info),
  );
  const t1 = performance.now();
  const loaded = loadSave(game, JSON.parse(text), sim, { game: 'salvage-run', build: 'bench' });
  const t2 = performance.now();
  if (!loaded.ok) throw new Error(`seed ${seed}: ${loaded.message}`);
  saves++;
  actions += session.log.length;
  bytes += text.length;
  largest = Math.max(largest, text.length);
  saving += t1 - t0;
  loading += t2 - t1;
}
const per = (ms: number) => ((ms * 1000) / saves).toFixed(0);
console.log(
  `${saves} saves, ${(actions / saves).toFixed(1)} logged actions and ${Math.round(bytes / saves)} bytes each ` +
    `(largest ${largest}): save ${per(saving)} µs, load ${per(loading)} µs ` +
    `(${((loading * 1000) / actions).toFixed(1)} µs per logged action)`,
);
