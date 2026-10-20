/**
 * eb with the maps kit (M4.6, D56): the drift, a slice of Space-Wrecked's sector run, and the
 * valley, a map drawn by hand in Dirtbag's style. Each validates clean, which runs the sector's
 * rules over 300 seeds (W135), and plays to its golden runs with its own bot. The drift's pilot
 * gets through all three sectors in most of 300 runs and every run ends; in the valley, a drive
 * takes the quickest road, its hours and its cash.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { createGame, createRecordStore, type GameState, playRun, readPack } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const DRIFT = resolve(import.meta.dirname, 'fixtures/drift');
const VALLEY = resolve(import.meta.dirname, 'fixtures/valley');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

async function load(folder: string) {
  const source = folderSource(folder);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error(`${folder} does not load`);
  const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
  const sim = { content: createRecordStore(compiled.pack.records) };
  return { game, sim, policies: scripted.game.policies };
}

describe('eb with the maps kit', () => {
  it('validates the drift and the valley with no problems, the sector’s rules kept in all 300 seeds', () => {
    for (const [folder, records] of [
      [DRIFT, 28],
      [VALLEY, 6],
    ] as const) {
      const checked = eb(['validate', folder]);
      expect(checked.code, checked.out + checked.err).toBe(0);
      expect(checked.out).toMatch(new RegExp(`^${records} records: no problems, hash [0-9a-f]{16}\\.$`, 'm'));
    }
    const out = join(mkdtempSync(join(tmpdir(), 'eb-drift-')), 'drift.pack.json');
    expect(eb(['build', DRIFT, '--out', out]).code).toBe(0);
    expect(readPack(JSON.parse(readFileSync(out, 'utf8'))).project.kits).toEqual([
      'inventory',
      'economy',
      'events',
      'maps',
    ]);
    // eb validate checks the sector's rules over 300 seeds, in a process of its own.
  }, 30_000);

  it('plays each to its golden runs, refusing nothing it offered', () => {
    for (const [folder, golden] of [
      [DRIFT, 'drift-pilot'],
      [VALLEY, 'valley-random'],
    ] as const) {
      const file = resolve(import.meta.dirname, `fixtures/${golden}.golden.json`);
      // The golden file names its policy and seeds.
      const run = eb(['sim', folder, '--golden', file]);
      expect(run.code, run.out + run.err).toBe(0);
      expect(run.out).toContain('Refused offers: none.');
      expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${file}.`);
    }
    // Two eb sim processes of 100 runs each: seconds under a full suite's load.
  }, 30_000);

  it('gets the drift’s pilot through three sectors in most of 300 runs, every run ending by itself', async () => {
    const { game, sim, policies } = await load(DRIFT);
    const pilot = policies.find((p) => p.name === 'pilot');
    if (!pilot) throw new Error('the drift has no pilot');
    let through = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const run = playRun(game, sim, { policy: pilot, seed: `drift-${seed}`, maxTurns: 500 });
      expect(run.end, `seed ${seed}`).toBe('ended');
      if (game.fact(run.state, 'maps.at-end', {}, sim) === true && game.fact(run.state, 'maps.entered', {}, sim) === 3)
        through++;
    }
    expect(through).toBeGreaterThan(200);
  }, 30_000);

  it('drives the valley’s quickest road: home to the tower by town and the slab, four hours and three cash', async () => {
    const { game, sim } = await load(VALLEY);
    const state = game.init('valley', sim);
    const fact = (s: GameState, id: string, args = {}) => game.fact(s, id, args, sim) as number;
    const step = game.reduce(state, { type: 'maps/travel', move: 'drive', to: 'tower' }, sim);
    expect(step.accepted).toBe(true);
    expect(fact(step.state, 'time.tick') - fact(state, 'time.tick')).toBe(4);
    expect(
      fact(state, 'economy.amount', { resource: 'cash' }) - fact(step.state, 'economy.amount', { resource: 'cash' }),
    ).toBe(3);
    // The straight road, four hours on its own, loses to town's three; the tower's road is one more.
    expect(step.beats.filter((b) => b.type === 'maps/arrived').map((b) => b.node)).toEqual(['tower']);
  });
});
