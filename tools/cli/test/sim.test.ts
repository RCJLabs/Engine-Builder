import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readGolden } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { PROJECT } from '../../../packages/core/test/salvage.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const GAME = resolve(import.meta.dirname, 'fixtures/salvage-game.ts');
const SLOPPY = resolve(import.meta.dirname, 'fixtures/sloppy-game.ts');
/** 50 runs of salvage run with the steady bot. CI fails when a change makes any of them play out otherwise. */
const GOLDEN = resolve(import.meta.dirname, 'fixtures/salvage-steady.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}
const scratch = () => mkdtempSync(join(tmpdir(), 'eb-sim-'));
const sim = (...args: string[]) => eb(['sim', PROJECT, '--game', GAME, ...args]);

describe('eb sim', () => {
  it('plays 100 seeds by default and reports them with intervals', () => {
    const run = sim();
    expect(run.code).toBe(0);
    const lines = run.out.trim().split('\n');
    expect(lines[0]).toBe('salvage-run: 100 runs with the random policy, at most 1000 turns each.');
    expect(lines[1]).toBe('Ends: 100 ended.');
    expect(lines).toContainEqual(expect.stringMatching(/^voyage\.ending: home [\d.]+% \(95% [\d.]+% to [\d.]+%\)/));
    expect(lines).toContainEqual(expect.stringMatching(/^crew\.alive: mean [\d.]+ \(95% [\d.]+ to [\d.]+\);/));
    expect(lines.at(-1)).toBe('Refused offers: none.');
  });

  it('plays the policy and seeds asked for, and reports as JSON', () => {
    const run = sim('--policy', 'reckless', '--seeds', '40', '--prefix', 'r', '--json');
    expect(run.code).toBe(0);
    const out = JSON.parse(run.out);
    expect(out).toMatchObject({ ok: true, project: 'salvage-run', maxTurns: 1000, golden: null });
    expect(out.report).toMatchObject({ runs: 40, policy: 'reckless', refused: { count: 0 } });
    const ending = out.report.metrics.find((m: { label: string }) => m.label === 'voyage.ending');
    expect(ending.values.map((v: { value: string }) => v.value).sort()).toEqual(['home', 'lost']);
  });

  it('matches the golden runs of salvage run', () => {
    const run = sim('--golden', GOLDEN);
    expect(run).toMatchObject({ code: 0, err: '' });
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 50 runs match ${GOLDEN}.`);
  });

  it('writes a golden file, matches it, and names the seeds and slices a content change moves', () => {
    const dir = scratch();
    const golden = join(dir, 'runs.golden.json');
    expect(sim('--seeds', '30', '--golden', golden, '--update').out).toContain(`Wrote 30 runs to ${golden}.`);
    expect(Object.keys(readGolden(JSON.parse(readFileSync(golden, 'utf8'))).runs)).toHaveLength(30);
    expect(sim('--golden', golden).code).toBe(0);

    const richer = join(dir, 'project');
    cpSync(PROJECT, richer, { recursive: true });
    writeFileSync(
      join(richer, 'records/loot-table/dead-hauler.json'),
      '{ "entries": [{ "item": "medkit", "weight": 1 }] }',
    );
    const run = eb(['sim', richer, '--game', GAME, '--golden', golden]);
    expect(run.code).toBe(1);
    const lines = run.out.trim().split('\n');
    const header = lines.find((line) => line.includes('runs differ from'));
    expect(header).toMatch(/^\d+ of 30 runs differ from .*, and the content has changed since it was written:$/);
    expect(lines).toContainEqual(
      expect.stringMatching(/^ {2}seed-\d+: [a-z, ]*hold[a-z, ]* \(\d+ turns then, \d+ now/),
    );
    expect(lines.at(-1)).toBe('If the change is meant, run again with --update to write the new runs.');
  });

  it('fails a game that offers what it then refuses', () => {
    const run = eb(['sim', PROJECT, '--game', SLOPPY, '--seeds', '10']);
    expect(run.code).toBe(1);
    expect(run.out).toMatch(
      /Refused offers: \d+\. The game offered these and then refused them: seed-\d+ turn \d+, crew\/rest \(no-one-hurt\)/,
    );
  });

  it('fails content with errors before playing it', () => {
    const dir = scratch();
    cpSync(PROJECT, dir, { recursive: true });
    writeFileSync(join(dir, 'records/item/medkit.json'), '{ "value": -1 }');
    const run = eb(['sim', dir, '--game', GAME]);
    expect(run.code).toBe(1);
    expect(run.out).toContain('records/item/medkit.json#/value: error E001');
  });

  it.each([
    ['no game module', ['sim', PROJECT], 'eb sim needs --game <module>'],
    ['an unknown policy', ['--policy', 'psychic'], 'No policy "psychic": this game has random, steady, reckless'],
    ['a golden file that is not there', ['--golden', '/nowhere/runs.json'], "doesn't exist yet: run with --update"],
    ['seeds given to a golden check', ['--golden', GOLDEN, '--seeds', '5'], 'A golden file sets the seeds'],
    ['--update alone', ['--update'], '--update needs --golden <file>'],
    ['no seeds', ['--seeds', '0'], '--seeds takes a whole number from 1 to 1000000'],
    ['--types', ['--types', GAME], 'eb sim takes --game, not --types or --out'],
    ['a sim flag elsewhere', ['validate', PROJECT, '--policy', 'steady'], '--policy only applies to eb sim'],
  ])('stops with code 2 on %s', (_name, args, message) => {
    const run = args[0] === 'sim' || args[0] === 'validate' ? eb(args) : sim(...args);
    expect(run.code).toBe(2);
    expect(run.err).toContain(message);
  });

  it('stops with code 2 on a golden file of another game, or a module without modules', () => {
    const dir = scratch();
    const other = join(dir, 'other.golden.json');
    writeFileSync(other, readFileSync(GOLDEN, 'utf8').replace('"game": "salvage-run"', '"game": "space-wrecked"'));
    expect(sim('--golden', other)).toMatchObject({
      code: 2,
      err: expect.stringContaining('holds runs of "space-wrecked"'),
    });
    const empty = join(dir, 'empty.ts');
    writeFileSync(empty, 'export const recordTypes = [];\n');
    expect(eb(['sim', PROJECT, '--game', empty])).toMatchObject({
      code: 2,
      err: expect.stringContaining('must export modules'),
    });
  });
});
