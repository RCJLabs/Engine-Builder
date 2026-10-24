/**
 * eb with a terrain and water (M5.3, D65): the fell, a hill with a hollow on its shoulder, its
 * heights and paint PNGs beside it, a tarn in the hollow and a lochan above it. eb validates it
 * clean, and a copy broken once for each of M5.3's checks gives each at its file and field.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const FELL = resolve(import.meta.dirname, 'fixtures/fell');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

/** Each problem eb printed as "code file#pointer", its line left out. */
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
const TERRAIN = { size: 129, spacing: 1, low: 0, high: 10, layers: [{ name: 'Scree', color: '#9a948c' }] };

describe('eb with a terrain and water', () => {
  it('validates the fell clean', () => {
    const run = eb(['validate', FELL]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out.trim()).toMatch(/^0 records: no problems, hash [0-9a-f]{16}\.$/);
  });

  it('gives each of M5.3’s checks at its file and field', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'eb-fell-')), 'fell');
    cpSync(FELL, dir, { recursive: true });
    const spaces = join(dir, 'spaces');
    const heights = readFileSync(join(spaces, 'fell.heights.png'));
    // The fell: its heights gone, its paint the wrong kind of PNG, and water on its cairn.
    rmSync(join(spaces, 'fell.heights.png'));
    writeFileSync(join(spaces, 'fell.paint.png'), heights);
    const fell = JSON.parse(readFileSync(join(spaces, 'fell.json'), 'utf8'));
    fell.objects[2].components = { water: {} };
    writeFileSync(join(spaces, 'fell.json'), json(fell));
    // The moor: heights of another size, paint that isn't a PNG.
    writeFileSync(join(spaces, 'moor.json'), json({ name: 'Moor', terrain: TERRAIN, objects: [] }));
    writeFileSync(join(spaces, 'moor.heights.png'), heights);
    writeFileSync(join(spaces, 'moor.paint.png'), 'Not a picture.\n');
    // A size no terrain has, a terrain's file with no space, and a prefab with a terrain.
    writeFileSync(join(spaces, 'bog.json'), json({ name: 'Bog', terrain: { ...TERRAIN, size: 100 }, objects: [] }));
    writeFileSync(join(spaces, 'scree.paint.png'), heights);
    mkdirSync(join(dir, 'prefabs'));
    writeFileSync(join(dir, 'prefabs/ridge.json'), json({ name: 'Ridge', terrain: TERRAIN, objects: [] }));
    const run = eb(['validate', dir]);
    expect(run.code).toBe(1);
    expect(problems(run.out)).toEqual([
      'E058 prefabs/ridge.json#/terrain',
      'E058 spaces/bog.json#/terrain/size',
      'W145 spaces/fell.json#/objects/2',
      'E067 spaces/fell.json#/terrain',
      'E067 spaces/fell.paint.png',
      'E067 spaces/moor.heights.png',
      'E067 spaces/moor.paint.png',
      'W144 spaces/scree.paint.png',
    ]);
    // Each of E067's four ways, in its own words.
    for (const words of [
      'No spaces/fell.heights.png: a terrain’s heights sit beside its space',
      'The paint are a 8-bit RGBA PNG',
      'It is 65×65; the terrain is 129×129',
      'It isn’t a PNG',
      'Ignored: there is no spaces/scree.json',
    ]) {
      expect(run.out).toContain(words);
    }
  });
});
