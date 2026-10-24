/**
 * eb with environments (M5.4, D66): the dale, its seven preset environments and a dusk of its
 * own, named by a farm, a cave and a station, with a lamp prefab beside them. eb validates it
 * clean, and a copy broken once for each of M5.4's checks gives each at its file and field.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const DALE = resolve(import.meta.dirname, 'fixtures/dale');

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

describe('eb with environments', () => {
  it('validates the dale clean', () => {
    const run = eb(['validate', DALE]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out.trim()).toMatch(/^8 records: no problems, hash [0-9a-f]{16}\.$/);
  });

  it('gives each of M5.4’s checks at its file and field', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'eb-dale-')), 'dale');
    cpSync(DALE, dir, { recursive: true });
    const edit = (path: string, change: (value: Record<string, unknown>) => void) => {
      const value = JSON.parse(readFileSync(join(dir, path), 'utf8'));
      change(value);
      writeFileSync(join(dir, path), json(value));
    };
    // The dusk's fog whole where it starts; the cave at an hour there isn't; the station naming a
    // bridge there is no record of; the farm naming one by a name that isn't an id; and the lamp,
    // a prefab, naming one at all.
    edit('records/environment/dale-dusk.json', (dusk) => {
      dusk.fog = { color: '#8a7f86', near: 300, far: 300 };
    });
    edit('records/environment/cave.json', (cave) => {
      cave.hour = 25;
    });
    edit('spaces/station.json', (station) => {
      station.environment = 'bridge';
    });
    edit('spaces/dale.json', (dale) => {
      dale.environment = 'Dale at dusk';
    });
    edit('prefabs/lamp.json', (lamp) => {
      lamp.environment = 'dale-dusk';
    });
    const run = eb(['validate', dir]);
    expect(run.code).toBe(1);
    expect(problems(run.out)).toEqual([
      'E058 prefabs/lamp.json#/environment',
      'E001 records/environment/cave.json#/hour',
      'E068 records/environment/dale-dusk.json#/fog/near',
      'E058 spaces/dale.json#/environment',
      'E069 spaces/station.json#/environment',
    ]);
    for (const words of [
      'Only a space has an environment: a prefab takes its space’s',
      'The fog starts at 300 m, not nearer than where it is whole, 300 m',
      'No environment record "bridge"',
    ]) {
      expect(run.out).toContain(words);
    }
  });
});
