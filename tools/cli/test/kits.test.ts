/**
 * eb with a project that lists kits (M3.3, D41): the hangar, a slice of Space-Wrecked's act 1, its
 * parts, credits, shop and job board as records of the inventory and economy kits. Its game is its
 * own scripts, which eb runs with the kits' modules joined.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, type GameState, Rng, readPack } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const HANGAR = resolve(import.meta.dirname, 'fixtures/hangar');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/hangar-worker.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('eb with kits', () => {
  it('validates the hangar with no problems, and builds it into a format 3 pack with its kits', () => {
    const checked = eb(['validate', HANGAR]);
    expect(checked.code).toBe(0);
    expect(checked.out).toMatch(/^31 records: no problems, hash [0-9a-f]{16}\.$/m);
    const out = join(mkdtempSync(join(tmpdir(), 'eb-hangar-')), 'hangar.pack.json');
    expect(eb(['build', HANGAR, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(pack.format).toBe(3);
    expect(pack.project.kits).toEqual(['inventory', 'economy']);
  });

  it('plays the hangar to its golden runs, with no offer refused', () => {
    const run = eb(['sim', HANGAR, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });
});

describe('the hangar, played', () => {
  it('charges for every buy exactly the price economy.price read just before, and accepts every offer', async () => {
    const source = folderSource(HANGAR);
    const scripted = await projectGame(source);
    const compiled = await compileWithGame(source, scripted);
    if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the hangar does not load');
    const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
    const sim = { content: createRecordStore(compiled.pack.records) };
    const credits = (state: GameState) => game.fact(state, 'economy.amount', { resource: 'credits' }, sim) as number;
    let buys = 0;
    for (let seed = 0; seed < 60; seed++) {
      const rng = Rng.create(`hangar-gate:${seed}`);
      let state = game.init(`gate-${seed}`, sim);
      for (let turn = 0; turn < 400; turn++) {
        const offered = game.options(state, sim);
        if (offered.length === 0) break;
        const action = rng.pick(offered) as Action;
        const shown =
          action.type === 'economy/buy'
            ? game.fact(state, 'economy.price', { shop: 'dutch-yard', item: action.item }, sim)
            : undefined;
        const step = game.reduce(state, action, sim);
        expect(step.accepted, `seed ${seed}, turn ${turn}: ${JSON.stringify(action)}`).toBe(true);
        if (action.type === 'economy/buy') {
          buys++;
          expect(credits(state) - credits(step.state)).toBe(shown);
          expect(step.beats).toContainEqual(expect.objectContaining({ type: 'economy/bought', price: shown }));
        }
        state = step.state;
      }
    }
    // Enough buys that the check means something.
    expect(buys).toBeGreaterThan(100);
  });
});
