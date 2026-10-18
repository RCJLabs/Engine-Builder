/**
 * Timings for M3.2's script worker jobs, in Node: checking a project's scripts (sucrase and the
 * purity rules), with and without running game.ts, and Run's twenty games. Run with
 * `node apps/editor/test/scripts-bench.ts`; the browser's worker adds its own start.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { checkJob, playJob } from '../src/scripts/jobs.ts';
import type { SentFile } from '../src/scripts/protocol.ts';
import { firstModuleTemplate, gameTemplate, moduleTemplate } from '../src/scripts/templates.ts';

const HOLD = resolve(import.meta.dirname, '../../../tools/cli/test/fixtures/hold');
const encode = (text: string) => new TextEncoder().encode(text);

function folder(dir: string): SentFile[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(dir, path).split('\\').join('/'), new Uint8Array(readFileSync(path))] as const;
    });
}

/** Helper functions to lengthen a script by about 3 × `n` lines. */
const padding = (n: number) =>
  Array.from({ length: n }, (_, i) => `export function helper${i}(x: number): number {\n  return x + ${i};\n}\n`).join(
    '',
  );

/** A game of `n` modules: the first module Start a game writes, and n - 1 more, each listed by game.ts. */
function bigGame(n: number, pad = 0): SentFile[] {
  const ids = Array.from({ length: n - 1 }, (_, i) => `part-${i + 1}`);
  const names = ids.map((id) => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()));
  const game = gameTemplate('main')
    .replace(
      "import { main } from './main';",
      ["import { main } from './main';", ...ids.map((id, i) => `import { ${names[i]} } from './${id}';`)].join('\n'),
    )
    .replace('export const modules = [main];', `export const modules = [main, ${names.join(', ')}];`);
  return [
    ['project.json', encode(JSON.stringify({ format: 1, id: 'big', name: 'Big', version: '0.1.0' }))],
    ['scripts/game.ts', encode(game)],
    ['scripts/main.ts', encode(firstModuleTemplate('main'))],
    ...ids.map((id): SentFile => [`scripts/${id}.ts`, encode(moduleTemplate(id) + padding(pad))]),
  ];
}

async function time(label: string, runs: number, each: () => Promise<unknown>): Promise<void> {
  const medians: number[] = [];
  for (let round = 0; round < 5; round++) {
    const ms: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      await each();
      ms.push(performance.now() - start);
    }
    ms.sort((a, b) => a - b);
    medians.push(ms[Math.floor(ms.length / 2)] as number);
  }
  medians.sort((a, b) => a - b);
  const f = (x: number) => x.toFixed(2);
  console.log(
    `${label}: ${f(medians[0] as number)}–${f(medians[4] as number)} ms (median ${f(medians[2] as number)}), medians of ${runs}`,
  );
}

const hold = folder(HOLD);
const holdScripts = hold.filter(([path]) => path.startsWith('scripts/'));
const big = bigGame(20);
const bigScripts = big.filter(([path]) => path.startsWith('scripts/'));
const long = bigGame(20, 100).filter(([path]) => path.startsWith('scripts/'));
const lines = (files: SentFile[]) =>
  files.reduce((n, [, bytes]) => n + new TextDecoder().decode(bytes).split('\n').length, 0);
console.log(
  `hold: ${holdScripts.length} scripts; big: ${bigScripts.length} scripts, ${lines(bigScripts)} lines; long: ${lines(long)} lines`,
);
await time('check hold, not run', 50, () => checkJob(holdScripts, false));
await time('check hold, game run', 50, () => checkJob(holdScripts, true));
await time('check big, not run', 20, () => checkJob(bigScripts, false));
await time('check big, game run', 20, () => checkJob(bigScripts, true));
await time('check long, game run', 10, () => checkJob(long, true));
await time('Run hold, 20 games (greedy)', 10, () => playJob(hold, 20, 'greedy'));
await time('Run big, 20 games (worker)', 10, () => playJob(big, 20, 'worker'));
