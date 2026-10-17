/**
 * Times the sim kernel on salvage run: 1,000 seeds played by the test bot, reported as
 * microseconds per reduce. The instrument behind the "sim kernel reduce" reading in ROADMAP.md.
 *
 *   node packages/core/test/salvage-bench.ts
 */
import { type Action, createGame, createSession } from '../src/index.ts';
import { botAction, botFor, salvageModules, sim } from './salvage.ts';

const game = createGame({ modules: salvageModules, start: 'travel' });
let reduces = 0;
let refused = 0;
const started = performance.now();
for (let i = 0; i < 1000; i++) {
  const seed = `seed-${i}`;
  const session = createSession(game, sim, game.init(seed, sim));
  const bot = botFor(seed);
  for (let n = 0; n < 400; n++) {
    const action = botAction(session.state, game.allowedActions(session.state), bot);
    if (!action) break;
    reduces++;
    if (!session.dispatch(action as Action).accepted) refused++;
  }
}
const elapsed = performance.now() - started;
console.log(
  `${reduces} reduces (${refused} refused) in ${Math.round(elapsed)} ms: ${((elapsed * 1000) / reduces).toFixed(1)} µs each`,
);
