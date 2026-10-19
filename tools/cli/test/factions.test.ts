/**
 * eb with the factions and time kits (M3.5, D43): the steading, a slice of Landnam, its neighbours
 * and their bands, the posts they trade from and a calendar of 24-day seasons in project.json. Its
 * game is its own scripts, which eb runs with the four kits' modules joined. And the almanac, whose
 * game is a --game module that the time kit joins with project.json's calendar.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, type GameState, Rng, readPack } from '@eb/core';
import { buyPrice, type FactionRecord, type ItemRecord, type ShopRecord } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const STEADING = resolve(import.meta.dirname, 'fixtures/steading');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/steading-jarl.golden.json');
const ALMANAC = resolve(import.meta.dirname, 'fixtures/almanac');
const ALMANAC_GAME = resolve(import.meta.dirname, 'fixtures/almanac-game.ts');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('eb with the factions and time kits', () => {
  it('validates the steading with no problems, and builds a format 3 pack with its kits and calendar', () => {
    const checked = eb(['validate', STEADING]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^20 records: no problems, hash [0-9a-f]{16}\.$/m);
    const out = join(mkdtempSync(join(tmpdir(), 'eb-steading-')), 'steading.pack.json');
    expect(eb(['build', STEADING, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(pack.format).toBe(3);
    expect(pack.project.kits).toEqual(['inventory', 'economy', 'factions', 'time']);
    const manifest = JSON.parse(readFileSync(join(STEADING, 'project.json'), 'utf8'));
    expect(pack.project.calendar).toEqual(manifest.calendar);
  });

  it('plays the steading to its golden runs, with no offer refused', () => {
    const run = eb(['sim', STEADING, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });

  it('joins the time kit to a --game module’s game with project.json’s calendar', () => {
    const run = eb(['sim', ALMANAC, '--game', ALMANAC_GAME, '--seeds', '2']);
    expect(run.code, run.out + run.err).toBe(0);
    // Two years of 8 days: the wet season starts on days 4 and 12.
    expect(run.out).toContain('rains: mean 2 (95% 2 to 2)');
  });
});

describe('the steading, played', () => {
  it('charges every buy the item’s value at the post’s rate, times its neighbour’s band’s share, rounded once', async () => {
    const source = folderSource(STEADING);
    const scripted = await projectGame(source);
    const compiled = await compileWithGame(source, scripted);
    if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the steading does not load');
    const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
    const sim = { content: createRecordStore(compiled.pack.records) };
    // The share worked out another way: the faction's bands read here, not through the kit.
    const share = (state: GameState, faction: string) => {
      const record = sim.content.get('faction', faction) as FactionRecord;
      const standing = game.fact(state, 'factions.standing', { faction }, sim) as number;
      const bands = record.bands ?? [];
      const reached = bands.filter((band, i) => i === 0 || (band.from ?? Number.POSITIVE_INFINITY) <= standing);
      return reached.at(-1)?.price ?? 100;
    };
    const shares = new Set<number>();
    let bought = 0;
    for (let seed = 0; seed < 30; seed++) {
      const rng = Rng.create(`steading-gate:${seed}`);
      let state: GameState = game.init(`gate-${seed}`, sim);
      for (let turn = 0; turn < 400; turn++) {
        const offered = game.options(state, sim);
        if (offered.length === 0) break;
        const action = rng.pick(offered) as Action;
        const step = game.reduce(state, action, sim);
        expect(step.accepted).toBe(true);
        for (const beat of step.beats.filter((b) => b.type === 'economy/bought')) {
          const shop = sim.content.get('shop', beat.shop as string) as ShopRecord;
          const item = sim.content.get('item', beat.item as string) as ItemRecord;
          const cut = share(state, shop.faction as string);
          shares.add(cut);
          expect(beat.price, `seed ${seed}, turn ${turn}`).toBe(
            buyPrice(item.value ?? 0, shop['sells-at'] ?? 100, [cut], 1),
          );
          bought += 1;
        }
        state = step.state;
      }
    }
    // Enough buys, at enough bands, that the check means something.
    expect(bought).toBeGreaterThan(200);
    expect([...shares].sort((a, b) => a - b)).toEqual([70, 85, 100, 150]);
  });
});
