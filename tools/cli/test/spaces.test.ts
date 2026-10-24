/**
 * eb with spaces' components, placed records and overrides (M5.2, D64): the lodge, a yard with
 * every engine kind and a kind of its own (a climbing hold), keepers placed and changed where they
 * stand, and a porch prefab whose lantern a placement dims and colours. eb validates it clean, and
 * a copy broken once for each of M5.2's checks gives each at its file and field.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const LODGE = resolve(import.meta.dirname, 'fixtures/lodge');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

type Json = Record<string, unknown> & { objects: Record<string, unknown>[] };

/** A copy of the lodge with `change` made to each file it names. */
function broken(changes: Record<string, (file: Json) => void>, extra: Record<string, string> = {}): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'eb-lodge-')), 'lodge');
  cpSync(LODGE, dir, { recursive: true });
  for (const [path, change] of Object.entries(changes)) {
    const file = JSON.parse(readFileSync(join(dir, path), 'utf8')) as Json;
    change(file);
    writeFileSync(join(dir, path), `${JSON.stringify(file, null, 2)}\n`);
  }
  for (const [path, text] of Object.entries(extra)) writeFileSync(join(dir, path), text);
  return dir;
}

const at = (file: Json, id: string) => file.objects.find((o) => o.id === id) as Record<string, unknown>;

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

describe('eb with spaces’ components, placed records and overrides', () => {
  it('validates the lodge clean, but for the flag only its trigger zone sets and reads', () => {
    const run = eb(['validate', LODGE]);
    expect(run.code, run.out + run.err).toBe(0);
    // The flag lint reads records alone: a trigger zone's sets and reads count once M5.7 runs them.
    expect(run.out.trim().split('\n')).toEqual([
      'records/flag/met-greta.json: warning W110: Nothing sets or reads this flag',
      expect.stringMatching(/^4 records: 1 warning, hash [0-9a-f]{16}\.$/),
    ]);
  });

  it('gives each of M5.2’s checks at its file and field', () => {
    const dir = broken(
      {
        'spaces/yard.json': (yard) => {
          (at(yard, 'boulder').components as Record<string, unknown>).glow = {};
          (at(yard, 'kettle').components as Record<string, Record<string, unknown>>).sound = {
            of: 'sound:kettle',
            volume: 3,
          };
          at(yard, 'greta').overrides = { greeting: 'Welcome up.', hat: 'red' };
          at(yard, 'porch').overrides = { chimney: { name: 'Chimney' } };
          at(yard, 'side-door').components = { spawn: { start: true } };
          yard.objects.push({ id: 'ghost', record: 'keeper:olga' });
        },
      },
      { 'components/notes.md': 'Holds are graded by feel.\n' },
    );
    const run = eb(['validate', dir]);
    expect(run.code).toBe(1);
    expect(problems(run.out)).toEqual([
      'W143 components/notes.md',
      'W110 records/flag/met-greta.json',
      'E065 spaces/yard.json#/objects/2/overrides/hat',
      'E066 spaces/yard.json#/objects/3/overrides/chimney',
      'E063 spaces/yard.json#/objects/4/components/sound/volume',
      'E062 spaces/yard.json#/objects/5/components/glow',
      'W142 spaces/yard.json#/objects/6',
      'E064 spaces/yard.json#/objects/7/record',
    ]);
  });

  it('gives E058 for a placement with a colour, and checks that file no further', () => {
    const dir = broken({
      'spaces/yard.json': (yard) => {
        at(yard, 'porch').color = '#ff0000';
        at(yard, 'greta').overrides = { hat: 'red' };
      },
    });
    const run = eb(['validate', dir]);
    expect(run.code).toBe(1);
    expect(problems(run.out)).toEqual(['W110 records/flag/met-greta.json', 'E058 spaces/yard.json#/objects/3/color']);
  });
});
