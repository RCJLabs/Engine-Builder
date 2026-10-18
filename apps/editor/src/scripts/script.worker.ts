/**
 * The script worker's thread (M3.2, D38): jobs run one at a time, in the order they came, each
 * answered with plain data. Before the first job that runs a script, the host's ways out go
 * (lockDown.ts). A script that never returns holds the thread; the page stops the worker.
 */
import { checkJob, playJob } from './jobs.ts';
import { lockDown } from './lockDown.ts';
import type { ScriptReply, ScriptRequest } from './protocol.ts';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ScriptRequest>) => void) | null;
  postMessage(reply: ScriptReply): void;
};
// Taken before any script runs: a script may change the global, not this.
const post = scope.postMessage.bind(scope);
let locked = false;

async function answer(request: ScriptRequest): Promise<ScriptReply> {
  if (!locked && (request.kind === 'play' || request.run)) {
    lockDown(scope);
    locked = true;
  }
  if (request.kind === 'check') return { id: request.id, ok: true, check: await checkJob(request.files, request.run) };
  return { id: request.id, ok: true, play: await playJob(request.files, request.seeds, request.policy) };
}

let queue: Promise<void> = Promise.resolve();

scope.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      post(await answer(data));
    } catch (error) {
      post({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
