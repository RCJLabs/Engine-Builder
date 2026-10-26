/**
 * `pnpm make:starter-character` (M6.5): writes starter-character/ at the repo's root from the code
 * in this folder, taking out any file there it no longer makes. The character's test holds the
 * committed files to what this writes; walk.js and Add starter character take them from there.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { makeCharacter } from './character.ts';

const OUT = resolve(import.meta.dirname, '../../../../starter-character');

const listed = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listed(join(folder, entry.name)) : [join(folder, entry.name)],
  );

const files = await makeCharacter();
const made = new Set(files.map((file) => file.path));
mkdirSync(OUT, { recursive: true });
for (const path of listed(OUT)) if (!made.has(relative(OUT, path).split('\\').join('/'))) rmSync(path);
for (const file of files) {
  mkdirSync(dirname(join(OUT, file.path)), { recursive: true });
  writeFileSync(join(OUT, file.path), file.bytes);
}
console.log(`Wrote ${files.length} files to starter-character/.`);
