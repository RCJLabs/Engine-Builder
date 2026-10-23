/**
 * Measures the Play panel's debug tools (M4.9, D59) as the Play worker answers them, in Node, on
 * the hut: a shell step and its look, a debug step, a step back over a season's run and over a
 * run at the recording's cap, and Replay on the project's files. The cap's run is debug steps of
 * `wait` with no length, which the hut takes in any mode. The instrument behind the "debug tools"
 * reading in ROADMAP.md.
 *
 *   node apps/editor/test/debug-bench.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { playJobs } from '../src/play/jobs.ts';
import type { PlayPageReply } from '../src/play/protocol.ts';
import type { SentFile } from '../src/scripts/protocol.ts';

const HUT = resolve(import.meta.dirname, '../../../tools/cli/test/fixtures/hut');
const ROUNDS = 10;
const CAP = 10_000;

const files: SentFile[] = readdirSync(HUT, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const path = join(entry.parentPath, entry.name);
    return [relative(HUT, path).split('\\').join('/'), new Uint8Array(readFileSync(path))] as SentFile;
  });

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const ms = (n: number) => `${n.toFixed(2)} ms`;

async function started() {
  const jobs = playJobs();
  let id = 0;
  const send = async (request: Record<string, unknown>) =>
    (await jobs({ id: id++, ...request } as never)) as PlayPageReply;
  await send({ kind: 'open-files', files });
  const first = await send({ kind: 'start', seed: '1', saving: { edition: 'playtest' }, at: 0 });
  if (first.kind !== 'started') throw new Error('The hut didn’t start');
  return { send, offered: first.view.offered };
}

async function timed(work: () => Promise<PlayPageReply>): Promise<[number, PlayPageReply]> {
  const t = performance.now();
  const reply = await work();
  return [performance.now() - t, reply];
}

/** What a keeper takes next from the offers: a load carried, the hut closed, else the first offer. */
function next(offered: readonly { type: string }[]) {
  return offered.find((a) => a.type === 'hut/carry') ?? offered.find((a) => a.type === 'hut/close') ?? offered[0];
}

// A season played as a keeper would, to the hut closed: the storm, the talks and the store answered.
const steps: number[] = [];
const looks: number[] = [];
const runs: number[] = [];
const backs: number[] = [];
const replays: number[] = [];
let seasonSteps = 0;
let lookBytes = 0;
for (let round = 0; round < ROUNDS; round++) {
  const game = await started();
  const { send } = game;
  let { offered } = game;
  for (let turn = 0; turn < 60; turn++) {
    const action = next(offered);
    if (!action) break;
    const [t, stepped] = await timed(() => send({ kind: 'act', action, at: 0 }));
    steps.push(t);
    if (stepped.kind !== 'stepped' || !stepped.accepted) throw new Error(`Refused: ${JSON.stringify(action)}`);
    offered = stepped.view.offered;
    const [l, look] = await timed(() => send({ kind: 'debug-look' }));
    looks.push(l);
    if (look.kind === 'debug-looked') {
      seasonSteps = look.look.cursor;
      lookBytes = JSON.stringify(look.look).length;
    }
  }
  const [r] = await timed(() => send({ kind: 'debug-run', effects: [{ effect: 'wait', days: 1 }], at: 0 }));
  runs.push(r);
  const [b] = await timed(() => send({ kind: 'debug-back', at: 0 }));
  backs.push(b);
  const [p] = await timed(() => send({ kind: 'debug-replay', files, at: 0 }));
  replays.push(p);
}
console.log(`a shell step, median of ${steps.length}: ${ms(median(steps))}`);
console.log(`its look, median of ${looks.length}: ${ms(median(looks))}; ${lookBytes} bytes at ${seasonSteps} steps`);
console.log(`a debug step (wait a day), median of ${ROUNDS}: ${ms(median(runs))}`);
console.log(`step back over ${seasonSteps} steps, median of ${ROUNDS}: ${ms(median(backs))}`);
console.log(
  `replay ${seasonSteps} steps on the project's files, compile included, median of ${ROUNDS}: ${ms(median(replays))}`,
);

// The recording at its cap: CAP debug steps that wait no time.
const { send } = await started();
const capped: number[] = [];
let full = false;
for (let i = 0; i < CAP + 1; i++) {
  const [t, reply] = await timed(() => send({ kind: 'debug-run', effects: [{ effect: 'wait', days: 0 }], at: 0 }));
  capped.push(t);
  if (reply.kind === 'debug-moved') full = reply.look.full;
}
const [atCap, back] = await timed(() => send({ kind: 'debug-back', at: 0 }));
const bytes = back.kind === 'debug-moved' ? JSON.stringify(back.look).length : 0;
console.log(
  `a debug step at 0 to ${CAP} recorded, median of ${capped.length}: ${ms(median(capped))}; full after: ${full}`,
);
console.log(`step back over ${CAP - 1} steps at the cap, once: ${ms(atCap)}; its look ${bytes} bytes`);
