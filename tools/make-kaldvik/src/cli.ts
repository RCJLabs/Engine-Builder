/**
 * `pnpm make:kaldvik` (M6.10): writes the shore's terrain files into games/kaldvik/spaces/ from
 * shore.ts. Everything else in games/kaldvik/ is written by hand; shore.test.ts holds these to it.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeShore } from './shore.ts';

const GAME = resolve(import.meta.dirname, '../../../games/kaldvik');

const files = makeShore();
for (const file of files) writeFileSync(join(GAME, file.path), file.bytes);
console.log(`Wrote ${files.length} files to games/kaldvik/spaces/.`);
