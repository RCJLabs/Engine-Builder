/**
 * Measures Export (M4.10, D60) on the hut with a taster that leaves out a map of the summit: each
 * target made from packs already compiled, the leak check and its control with it, and the sizes of
 * what it writes, the runtime's own beside them. The runtime is apps/editor's dist-game/, so run
 * `pnpm build` first. The instrument behind the "Export" reading in ROADMAP.md.
 *
 *   node packages/export/test/export-bench.ts [rounds]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { exportGame, type Runtime } from '../src/index.ts';
import { hutPacks, hutSource, settingsOf } from './hut.ts';

const ROUNDS = Number(process.argv[2] ?? 20);
const DIST = resolve(import.meta.dirname, '../../../apps/editor/dist-game');
const runtime: Runtime = {
  version: 'bench',
  js: readFileSync(resolve(DIST, 'game.js'), 'utf8'),
  css: readFileSync(resolve(DIST, 'game.css'), 'utf8'),
};

const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;
const gz = (text: string | Uint8Array) => gzipSync(text).byteLength;
const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const at = (values: number[], q: number) =>
  sorted(values)[Math.min(values.length - 1, Math.floor(values.length * q))] ?? 0;

const source = hutSource();
const settings = await settingsOf(source);
const started = performance.now();
const packs = await hutPacks(source);
console.log(
  `compiled the full game and the taster, with the game's scripts: ${(performance.now() - started).toFixed(0)} ms`,
);
console.log(
  `runtime: game.js ${kb(runtime.js.length)} (${kb(gz(runtime.js))} gzip), game.css ${kb(runtime.css.length)} (${kb(gz(runtime.css))} gzip)`,
);
console.log(`the hut's pack: ${kb(JSON.stringify(packs.full).length)} (${kb(gz(JSON.stringify(packs.full)))} gzip)`);

for (const [target, edition] of [
  ['web', 'full'],
  ['file', 'taster'],
  ['itch', 'taster'],
  ['repo', 'full'],
] as const) {
  const times: number[] = [];
  let last: Awaited<ReturnType<typeof exportGame>> | undefined;
  for (let round = 0; round < ROUNDS; round++) {
    const t = performance.now();
    last = await exportGame({
      target,
      settings,
      edition,
      pack: edition === 'full' ? packs.full : packs.edition,
      full: packs.full,
      runtime,
    });
    times.push(performance.now() - t);
  }
  if (!last?.ok) throw new Error(`${target} failed its leak check`);
  console.log(
    `${target} (${edition}): ${last.files.size} files, ${kb(last.bytes.byteLength)} written; made in ${at(times, 0.5).toFixed(0)} ms median, ${at(times, 0.95).toFixed(0)} ms p95 over ${ROUNDS}`,
  );
}
