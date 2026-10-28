import { describe, expect, it } from 'vitest';
import type { CheckResult, ScriptReply, ScriptRequest } from './protocol.ts';
import { CHECK_MS, PLAY_MS, ScriptTimeout, scriptWorker, type WorkerLike } from './scriptWorker.ts';

const CHECKED: CheckResult = { ids: ['game'], hasGame: true, diagnostics: [], ran: true, game: null, stages: [] };

/** Workers that hold what they are sent until a test answers, and timers a test fires. */
function harness() {
  const workers: (WorkerLike & { sent: ScriptRequest[]; stopped: boolean })[] = [];
  const timers: { ms: number; run: () => void; live: boolean }[] = [];
  const client = scriptWorker({
    start: () => {
      const worker = {
        onmessage: null,
        onerror: null,
        sent: [] as ScriptRequest[],
        stopped: false,
        postMessage(request: ScriptRequest) {
          this.sent.push(request);
        },
        terminate() {
          this.stopped = true;
        },
      };
      workers.push(worker);
      return worker;
    },
    after: (run, ms) => {
      const timer = { ms, run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
  });
  const answer = (worker: WorkerLike, reply: ScriptReply) =>
    worker.onmessage?.({ data: reply } as MessageEvent<ScriptReply>);
  return { client, workers, timers, answer };
}

describe('the page’s side of the script worker', () => {
  it('matches each answer to its job, whatever order they come in', async () => {
    const { client, workers, answer } = harness();
    const first = client.check([], true);
    const second = client.play([], 20, 'random');
    const [worker] = workers;
    if (!worker) throw new Error('no worker started');
    const [check, play] = worker.sent;
    expect(check).toMatchObject({ kind: 'check', run: true });
    expect(play).toMatchObject({ kind: 'play', seeds: 20, policy: 'random' });
    answer(worker, { id: play?.id ?? -1, ok: true, play: { kind: 'played', lines: ['ran'], ok: true } });
    answer(worker, { id: check?.id ?? -1, ok: true, check: CHECKED });
    await expect(first).resolves.toEqual(CHECKED);
    await expect(second).resolves.toEqual({ kind: 'played', lines: ['ran'], ok: true });
    expect(workers).toHaveLength(1);
  });

  it('stops a worker whose job runs past its time, and starts another for the next', async () => {
    const { client, workers, timers, answer } = harness();
    const hung = client.check([], true);
    expect(timers.map((t) => t.ms)).toEqual([CHECK_MS]);
    timers[0]?.run();
    await expect(hung).rejects.toBeInstanceOf(ScriptTimeout);
    expect(workers[0]?.stopped).toBe(true);
    const next = client.play([], 20, 'random');
    expect(workers).toHaveLength(2);
    expect(timers[1]?.ms).toBe(PLAY_MS);
    const [request] = workers[1]?.sent ?? [];
    answer(workers[1] as WorkerLike, { id: request?.id ?? -1, ok: true, play: { kind: 'refused', errors: [] } });
    await expect(next).resolves.toEqual({ kind: 'refused', errors: [] });
    // Answered in time: its timer is cancelled.
    expect(timers[1]?.live).toBe(false);
  });

  it('passes on what failed in the worker, and a worker that dies takes its jobs with it', async () => {
    const { client, workers, answer } = harness();
    const failing = client.check([], false);
    const [worker] = workers;
    answer(worker as WorkerLike, { id: worker?.sent[0]?.id ?? -1, ok: false, error: 'out of memory' });
    await expect(failing).rejects.toThrow('out of memory');
    const lost = client.check([], false);
    worker?.onerror?.({ message: 'crashed' } as ErrorEvent);
    await expect(lost).rejects.toThrow('The script worker stopped: crashed');
    void client.check([], false);
    expect(workers).toHaveLength(2);
  });
});
