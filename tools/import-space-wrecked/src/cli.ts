/**
 * pnpm import:space-wrecked [--from <data folder>]: writes games/space-wrecked/records/ from the
 * copy of Space-Wrecked's data in games/space-wrecked/source/, or from the folder named.
 */
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { importFolder } from './importAll.ts';
import { writeRecords } from './records.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const GAME = join(ROOT, 'games/space-wrecked');

const { values } = parseArgs({ options: { from: { type: 'string' } } });
const from = values.from ? resolve(values.from) : join(GAME, 'source');
const written = writeRecords(importFolder(from), join(GAME, 'records'));
console.log(`Wrote ${written} records to games/space-wrecked/records from ${from}`);
