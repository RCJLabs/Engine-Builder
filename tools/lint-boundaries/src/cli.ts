/**
 * `pnpm lint` runs this after Biome. Exits 1 on any violation, and also when it finds nothing
 * to check: a lint that silently scans zero files passes exactly like a clean one.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkPureSource, type Violation } from '@eb/purity';
import { rel, sourceFiles, workspacePackages } from './workspace.ts';

const root = resolve(import.meta.dirname, '../../..');
const packages = workspacePackages(root);
const pure = packages.filter((p) => p.pure);
const pureNames = new Set(pure.map((p) => p.name));

const violations: Violation[] = [];
let files = 0;
for (const pkg of pure) {
  for (const file of sourceFiles(pkg.dir)) {
    files++;
    violations.push(...checkPureSource(rel(root, file), readFileSync(file, 'utf8'), pureNames));
  }
}

if (pure.length === 0 || files === 0) {
  console.error('lint-boundaries: found no pure source files; check pnpm-workspace.yaml and the "eb.pure" markers');
  process.exit(1);
}
if (violations.length > 0) {
  for (const v of violations) console.error(`${v.file}:${v.line}  ${v.rule}`);
  console.error(`lint-boundaries: ${violations.length} violation(s)`);
  process.exit(1);
}
console.log(`lint-boundaries: ok (${pure.length} pure package(s), ${files} file(s): ${[...pureNames].join(', ')})`);
