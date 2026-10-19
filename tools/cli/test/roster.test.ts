/**
 * eb with the roster kit (M3.6, D44): the crew, a slice of Space-Wrecked, its backgrounds rolled
 * at two stations, its ranks, wounds and bonds. Its game is its own scripts, which eb runs with
 * the five kits' modules joined. Played here, every hire is checked against the offer worked out
 * again from its hall, round and slot, and every member's rank against its ladder.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, type GameState, Rng, readPack } from '@eb/core';
import { type ActorRecord, offerAt, type RosterRecord, type RosterSlice } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const CREW = resolve(import.meta.dirname, 'fixtures/crew');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/crew-captain.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('eb with the roster kit', () => {
  it('validates the crew with no problems, and builds a format 3 pack with its kits', () => {
    const checked = eb(['validate', CREW]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^22 records: no problems, hash [0-9a-f]{16}\.$/m);
    const out = join(mkdtempSync(join(tmpdir(), 'eb-crew-')), 'crew.pack.json');
    expect(eb(['build', CREW, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(pack.format).toBe(3);
    expect(pack.project.kits).toEqual(['inventory', 'economy', 'stats', 'time', 'roster']);
  });

  it('plays the crew to its golden runs, with no offer refused', () => {
    const run = eb(['sim', CREW, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });
});

const WEIGHTS: Readonly<Record<string, number>> = { 'crew/fight': 6, 'roster/hire': 3 };

async function loadCrew() {
  const source = folderSource(CREW);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the crew does not load');
  const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
  return { game, sim: { content: createRecordStore(compiled.pack.records) } };
}

describe('the crew, played', () => {
  it('hires every recruit as the offer worked out again from its hall, round and slot', async () => {
    const { game, sim } = await loadCrew();
    const ladder = (sim.content.get('roster', 'crew') as RosterRecord).ranks;
    let hired = 0;
    let dead = 0;
    for (let seed = 0; seed < 30; seed++) {
      const rng = Rng.create(`crew-gate:${seed}`);
      let state: GameState = game.init(`gate-${seed}`, sim);
      for (let turn = 0; turn < 300; turn++) {
        const offered = game.options(state, sim);
        if (offered.length === 0) break;
        // Fights and hires weighted up, as the captain policy has them, so members die and join.
        const action = offered[rng.weightedIndex(offered.map((a) => WEIGHTS[a.type] ?? 1))] as Action;
        const roster = state.roster as RosterSlice;
        const hall = (state.kernel.modes.at(-1)?.data as { hall?: string } | undefined)?.hall;
        const offer =
          action.type === 'roster/hire' && hall !== undefined
            ? offerAt(game.content(state, sim), roster, hall, action.slot as number)
            : undefined;
        const step = game.reduce(state, action, sim);
        expect(step.accepted, `seed ${seed}, turn ${turn}`).toBe(true);
        state = step.state;
        const after = game.content(state, sim);
        for (const beat of step.beats.filter((b) => b.type === 'roster/hired')) {
          const made = after.get('actor', beat.actor as string) as ActorRecord;
          expect(made.name).toBe(offer?.name);
          expect((state.roster as RosterSlice).made[beat.actor as string]).toMatchObject({
            recruit: offer?.recruit,
            name: offer?.name,
          });
          hired += 1;
        }
        for (const beat of step.beats.filter((b) => b.type === 'roster/left')) {
          expect(beat.why).toBe('dead');
          expect(game.fact(state, 'roster.left', { actor: beat.actor }, sim)).toBe('dead');
          expect(after.has('actor', beat.actor as string)).toBe(true);
          dead += 1;
        }
        // Each member holds its rank's status, and no other rank's.
        for (const actor of (state.roster as RosterSlice).members) {
          const rank = game.fact(state, 'roster.rank', { actor }, sim);
          for (const band of ladder?.bands ?? []) {
            if (band.status === undefined) continue;
            const has = game.fact(state, 'stats.has', { actor, status: band.status }, sim);
            expect(has, `seed ${seed}, turn ${turn}, ${actor} at ${String(rank)}`).toBe(band.id === rank ? 1 : 0);
          }
        }
      }
    }
    // Enough hires and deaths that the checks mean something.
    expect(hired).toBeGreaterThan(80);
    expect(dead).toBeGreaterThan(0);
  });
});
