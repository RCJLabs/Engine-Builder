/**
 * `pnpm make:moor` (M5.10): writes fixtures/moor/ from moor.ts, taking out any file there the moor
 * no longer makes. moor.test.ts holds the committed files to what this writes.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { makeMoor } from './moor.ts';

const OUT = resolve(import.meta.dirname, 'moor');

const listed = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listed(join(folder, entry.name)) : [join(folder, entry.name)],
  );

const files = makeMoor();
const made = new Set(files.map((file) => file.path));
mkdirSync(OUT, { recursive: true });
for (const path of listed(OUT)) if (!made.has(relative(OUT, path).split('\\').join('/'))) rmSync(path);
for (const file of files) {
  mkdirSync(dirname(join(OUT, file.path)), { recursive: true });
  writeFileSync(join(OUT, file.path), file.bytes);
}
console.log(`Wrote ${files.length} files to tools/cli/test/fixtures/moor/.`);
