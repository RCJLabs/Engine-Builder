import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** A project saved by format 1. It must keep compiling, to the same hash, until a decision says otherwise. */
export const FIXTURE_V1 = join(import.meta.dirname, 'fixtures/v1');
export const FIXTURE_TYPES = join(import.meta.dirname, 'fixtures/types.ts');

/** A folder's files as `{ path: text }`, with `/` between folders. */
export function readFixture(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    files[relative(dir, full).split(sep).join('/')] = readFileSync(full, 'utf8');
  }
  return files;
}
