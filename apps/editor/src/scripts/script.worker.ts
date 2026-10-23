/**
 * The script worker's thread (M3.2, D38): jobs run one at a time, in the order they came, each
 * answered with plain data. Before the first job that runs a script, the host's ways out go
 * (lockDown.ts). A script that never returns holds the thread; the page stops the worker.
 *
 * The Play panel and Export game (M4.1) start their own copies of this worker for a game played
 * through its screens, so the compiler and the kits ship once, and a check that times out here
 * never ends a game being played there.
 */
import { isDebugRequest } from '../play/debug/protocol.ts';
import { playJobs } from '../play/jobs.ts';
import type { PlayPageReply, PlayPageRequest } from '../play/protocol.ts';
import { checkJob, playJob } from './jobs.ts';
import { lockDown } from './lockDown.ts';
import type { ScriptReply, ScriptRequest } from './protocol.ts';

type Request = ScriptRequest | PlayPageRequest;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(reply: ScriptReply | PlayPageReply): void;
};
// Taken before any script runs: a script may change the global, not this.
const post = scope.postMessage.bind(scope);
let locked = false;
const playing = playJobs();

const isPlay = (request: Request): request is PlayPageRequest =>
  isDebugRequest(request) ||
  request.kind === 'open' ||
  request.kind === 'start' ||
  request.kind === 'load' ||
  request.kind === 'act' ||
  request.kind === 'look' ||
  request.kind === 'open-files' ||
  request.kind === 'pack';

async function answer(request: Request): Promise<ScriptReply | PlayPageReply> {
  if (!locked && (isPlay(request) || request.kind === 'play' || request.run)) {
    lockDown(scope);
    locked = true;
  }
  if (isPlay(request)) return playing(request);
  if (request.kind === 'check') return { id: request.id, ok: true, check: await checkJob(request.files, request.run) };
  return { id: request.id, ok: true, play: await playJob(request.files, request.seeds, request.policy) };
}

let queue: Promise<void> = Promise.resolve();

scope.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      post(await answer(data));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      post(isPlay(data) ? { id: data.id, kind: 'failed', message } : { id: data.id, ok: false, error: message });
    }
  });
};
