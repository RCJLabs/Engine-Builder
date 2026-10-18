/**
 * eb with the stats and gear kits (M3.4, D42): the arena, a slice of Ludus, its gladiators, their
 * traits, injuries and gear records of the kits. Its game is its own scripts, which eb runs with
 * the four kits' modules joined.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, type GameState, Rng, readPack } from '@eb/core';
import { type GearSlice, gearParts, type StatsSlice, statParts } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const ARENA = resolve(import.meta.dirname, 'fixtures/arena');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/arena-lanista.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('eb with the stats and gear kits', () => {
  it('validates the arena with no problems, and builds it into a format 3 pack with its four kits', () => {
    const checked = eb(['validate', ARENA]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^25 records: no problems, hash [0-9a-f]{16}\.$/m);
    const out = join(mkdtempSync(join(tmpdir(), 'eb-arena-')), 'arena.pack.json');
    expect(eb(['build', ARENA, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(pack.format).toBe(3);
    expect(pack.project.kits).toEqual(['inventory', 'economy', 'stats', 'gear']);
  });

  it('plays the arena to its golden runs, with no offer refused', () => {
    const run = eb(['sim', ARENA, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });
});

describe('the arena, played', () => {
  it('reads every value as its parts add up, rounded once, in every state its bouts reach', async () => {
    const source = folderSource(ARENA);
    const scripted = await projectGame(source);
    const compiled = await compileWithGame(source, scripted);
    if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the arena does not load');
    const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
    const sim = { content: createRecordStore(compiled.pack.records) };
    const actors = sim.content.ids('actor');
    const stats = sim.content.ids('stat');
    let worn = 0;
    let injured = 0;
    for (let seed = 0; seed < 30; seed++) {
      const rng = Rng.create(`arena-gate:${seed}`);
      let state: GameState = game.init(`gate-${seed}`, sim);
      for (let turn = 0; turn < 200; turn++) {
        for (const actor of actors) {
          // The parts worked out another way: each worn item on its own, not the gear kit's sums.
          const items = gearParts(sim.content, state.gear as GearSlice, actor, 'might');
          worn += items.length;
          for (const stat of stats) {
            const parts = statParts(
              sim.content,
              state.stats as StatsSlice,
              actor,
              stat,
              gearParts(sim.content, state.gear as GearSlice, actor, stat),
            );
            expect(
              game.fact(state, 'stats.value', { actor, stat }, sim),
              `seed ${seed}, turn ${turn}, ${actor} ${stat}`,
            ).toBe(parts.value);
          }
          injured += game.fact(state, 'stats.tagged', { actor, tag: 'injury' }, sim) as number;
        }
        const offered = game.options(state, sim);
        if (offered.length === 0) break;
        const step = game.reduce(state, rng.pick(offered) as Action, sim);
        expect(step.accepted).toBe(true);
        state = step.state;
      }
    }
    // Enough gear worn and injuries carried that the check means something.
    expect(worn).toBeGreaterThan(200);
    expect(injured).toBeGreaterThan(200);
  });
});
