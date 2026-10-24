/**
 * `pnpm budgets` (node tools/budgets/src/cli.ts [dist] [budgets.json]): after `pnpm build`, each
 * size against its budget in budgets.json. Exits 1 when any is over, naming it and by how much.
 */
import { resolve } from 'node:path';
import { checkSizes, measureSizes, readBudgets } from './budgets.ts';

const root = resolve(import.meta.dirname, '../../..');
const dist = resolve(process.argv[2] ?? `${root}/apps/editor/dist`);
const lines = checkSizes(readBudgets(resolve(process.argv[3] ?? `${root}/budgets.json`)), measureSizes(dist));
const kb = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
for (const line of lines) {
  const words = `${line.id}: ${kb(line.bytes)} of ${kb(line.budget)} (${line.bytes} bytes)`;
  console.log(line.over ? `::error::${words}, over by ${kb(line.bytes - line.budget)}` : words);
}
if (lines.some((line) => line.over)) process.exitCode = 1;
