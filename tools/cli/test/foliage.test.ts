/**
 * eb with foliage (M5.6, D68): the grove, a glade whose terrain grows pines from the starter kit to
 * the west and scrub on its hill, with its heights, paint and foliage density beside it. eb
 * validates it clean, and a copy broken once for each of M5.6's checks gives each at its file and
 * field.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pngOf } from '../../../packages/compiler/test/png.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const GROVE = resolve(import.meta.dirname, 'fixtures/grove');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

/** Each problem eb printed as "code file#pointer". */
const problems = (out: string) =>
  out
    .trim()
    .split('\n')
    .slice(0, -1)
    .map((line) => {
      const [, file, pointer, code] = /^([^:#]+)(?::\d+)?(#[^:]*)?: \w+ (\w\d+):/.exec(line) ?? [];
      return `${code} ${file}${pointer ?? ''}`;
    });

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A copy of the grove, with `edit` changing a JSON file of it. */
function copy() {
  const dir = join(mkdtempSync(join(tmpdir(), 'eb-grove-')), 'grove');
  cpSync(GROVE, dir, { recursive: true });
  const edit = (path: string, change: (value: Record<string, unknown>) => void) => {
    const value = JSON.parse(readFileSync(join(dir, path), 'utf8'));
    change(value);
    writeFileSync(join(dir, path), json(value));
  };
  return { dir, edit };
}

describe('eb with foliage', () => {
  it('validates the grove clean', () => {
    const run = eb(['validate', GROVE]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out.trim()).toMatch(/^6 records: no problems, hash [0-9a-f]{16}\.$/);
  });

  it('gives each of M5.6’s checks at its file and field', () => {
    const { dir, edit } = copy();
    // The glade's scrub named as ferns there aren't, the pines' sizes backwards, the density a
    // 16-bit greyscale PNG, and a moor with no terrain beside a density file of its own.
    edit('spaces/glade.json', (glade) => {
      (glade.terrain as { foliage: string[] }).foliage = ['pines', 'ferns'];
    });
    edit('records/foliage/pines.json', (pines) => {
      pines.smallest = 2;
      pines.largest = 1;
    });
    writeFileSync(join(dir, 'spaces/glade.foliage.png'), pngOf(65, 65, 16, 0));
    writeFileSync(join(dir, 'spaces/moor.json'), json({ name: 'Moor', objects: [] }));
    writeFileSync(join(dir, 'spaces/moor.foliage.png'), pngOf(65, 65, 8, 6));
    const run = eb(['validate', dir]);
    expect(run.code).toBe(1);
    expect(problems(run.out)).toEqual([
      'E074 records/foliage/pines.json#/smallest',
      'E067 spaces/glade.foliage.png',
      'E073 spaces/glade.json#/terrain/foliage/1',
      'W144 spaces/moor.foliage.png',
    ]);
    for (const words of [
      'The smallest, 2, is above the largest, 1',
      'The foliage’s density is a 8-bit RGBA PNG',
      'No foliage record "ferns"',
      'Ignored: spaces/moor.json has no terrain',
    ]) {
      expect(run.out).toContain(words);
    }
  });

  it('gives E058 for a foliage type listed twice, and E067 when its density file is gone', () => {
    const { dir, edit } = copy();
    edit('spaces/glade.json', (glade) => {
      (glade.terrain as { foliage: string[] }).foliage = ['pines', 'pines'];
    });
    expect(problems(eb(['validate', dir]).out)).toEqual(['E058 spaces/glade.json#/terrain/foliage']);
    const gone = copy();
    gone.edit('spaces/glade.json', () => {});
    writeFileSync(join(gone.dir, 'spaces/glade.foliage.png'), '');
    const run = eb(['validate', gone.dir]);
    expect(problems(run.out)).toEqual(['E067 spaces/glade.foliage.png']);
    expect(run.out).toContain('It isn’t a PNG');
  });
});
