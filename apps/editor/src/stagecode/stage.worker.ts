/**
 * A stage's worker (M7.4, D86, docs/specs/stages.md#where-it-runs), inlined in stage2d.js and started
 * from a blob, so it runs from file:// as the single-file export does. Before any stage code runs,
 * the host's ways out go, as the script worker's do (D38), and the worker's own messaging with them:
 * a stage answers only through what its frame returns. Best effort, not a sandbox.
 */
import { HOST_NAMES, lockDown } from '../scripts/lockDown.ts';
import type { FromStage, ToStage } from './protocol.ts';
import { createStageRunner } from './runner.ts';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ToStage>) => void) | null;
  postMessage(message: FromStage): void;
};
// Taken before the lock: what the stage could reach of these goes with it.
const post = scope.postMessage.bind(scope);
const now = performance.now.bind(performance);
const runner = createStageRunner(post, now);
scope.onmessage = ({ data }) => runner.take(data);
lockDown(scope, [...HOST_NAMES, 'postMessage', 'addEventListener', 'removeEventListener', 'close']);
