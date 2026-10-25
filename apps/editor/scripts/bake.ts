/**
 * pnpm bake <project> <space> (M6.2, D74): a space's navmesh baked as Bake navigation bakes it, and
 * written to spaces/<space>.nav. For fixtures and for projects kept in git without the editor open.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { memorySource, navPath } from '@eb/compiler';
import { bakeProjectSpace } from '../src/nav/bakeProject.ts';
import { NAV_LIB } from '../src/nav/lib.ts';

function filesOf(root: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(root, path).split('\\').join('/')] = readFileSync(path);
    }
  };
  walk(root);
  return files;
}

const [project, space] = process.argv.slice(2);
if (!project || !space) {
  console.error('Usage: pnpm bake <project folder> <space id>');
  process.exit(2);
}
// pnpm runs a script from the repository's root, where the paths are given from.
const root = resolve(process.env.INIT_CWD ?? process.cwd(), project);
const started = performance.now();
const baked = await bakeProjectSpace(memorySource(filesOf(root)), space, NAV_LIB);
writeFileSync(join(root, navPath(space)), baked.bytes);
const ms = Math.round(performance.now() - started);
console.log(
  `Baked ${navPath(space)}: ${baked.tiles} tile(s), ${baked.polygons} polygons, ${baked.bytes.length} bytes, ${ms} ms`,
);
