/**
 * What the size budgets measure in a built editor (M5.7, D69, docs/specs/performance.md#the-budgets):
 * the start a first visit loads, what the 3D view and its models add, the precache a device keeps,
 * and an export's folder. Chunks are followed by their static imports only: a dynamic import is
 * loaded when it is asked for, so it belongs to whatever asks.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// `import{a}from"./x.js"`, `import*as b from"./x.js"`, `import"./x.js"`, `export{c}from"./x.js"`;
// never `import("./x.js")`, which is loaded when asked for.
const STATIC = /(?:^|[^\w$.])(?:import|export)\s*(?:[^"'`;()]*?from\s*)?["'](\.\/[^"']+\.js)["']/g;

/** The chunks a chunk in `assets` imports statically, itself first, as file names. */
export function staticClosure(assets: string, chunk: string): string[] {
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const [, path] of readFileSync(join(assets, name), 'utf8').matchAll(STATIC)) visit((path as string).slice(2));
  };
  visit(chunk);
  return [...seen];
}

/** The one file in `assets` whose name is `stem`, a dash and vite's hash. */
export function chunkNamed(assets: string, stem: string, extension = '.js'): string {
  const found = readdirSync(assets).filter((name) => name.startsWith(`${stem}-`) && name.endsWith(extension));
  if (found.length !== 1) throw new Error(`expected one ${stem}-*${extension} in ${assets}, found ${found.length}`);
  return found[0] as string;
}

/** Bytes as gzip -9 has them, each file on its own as a server sends it. */
export const gzipped = (paths: readonly string[]) =>
  paths.reduce((sum, path) => sum + gzipSync(readFileSync(path), { level: 9 }).length, 0);

/** Every file under `folder`, in bytes. */
export function bytesIn(folder: string): number {
  return readdirSync(folder, { withFileTypes: true }).reduce((sum, entry) => {
    const path = join(folder, entry.name);
    return sum + (entry.isDirectory() ? bytesIn(path) : statSync(path).size);
  }, 0);
}

/** What index.html loads as it opens: its module, the chunks that module imports, and its styles. */
export function startFiles(dist: string): string[] {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const entry = /<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/.exec(html)?.[1];
  if (!entry) throw new Error(`no module script in ${join(dist, 'index.html')}`);
  const styles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\/assets\/([^"]+\.css)"/g)].map((m) => m[1]);
  return [...staticClosure(join(dist, 'assets'), entry), ...(styles as string[])];
}

/** The files the service worker precaches, as paths from the dist folder. */
export function precached(dist: string): string[] {
  const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
  return [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1] as string);
}
