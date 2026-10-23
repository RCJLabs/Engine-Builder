/**
 * eb with the encounters kit (M4.7, D57): the drift's hostile ships fought, hull and guns, and the
 * pit, a slice of Ludus, its gladiators sent from the roster. Each validates clean and plays to
 * its golden runs. The gate's own test: over 300 seeds of each, every fight the bots fight lands
 * in a row of the table its preview showed just before, at its result and hurt; and the wins over
 * all of them sit inside the Wilson interval of the chances shown.
 */
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, type Effect, type GameState, playRun, wilson } from '@eb/core';
import type { EventRecord, FightRow } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const DRIFT = resolve(import.meta.dirname, 'fixtures/drift');
const PIT = resolve(import.meta.dirname, 'fixtures/pit');

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

interface Seen {
  readonly fights: number;
  /** The shown chances of a win, in percent, added up over every fight. */
  readonly shown: number;
  readonly won: number;
}

/** The fight a choice holds, as the event that is open writes it. */
function fightIn(state: GameState, content: ReturnType<typeof createRecordStore>, action: Action): Effect | undefined {
  if (action.type !== 'events/choose') return undefined;
  const open = (state.events as { open?: string }).open as string;
  const event = content.get('event', open) as EventRecord;
  const choice = event.choices.find((c) => c.id === action.choice);
  return choice?.effects?.find((e) => e.effect === 'fight');
}

/** Every fight of a run played again: the preview before, then where the roll landed. */
function fightsOf(loaded: Awaited<ReturnType<typeof load>>, policy: string, seed: string): Seen {
  const { game, sim, policies } = loaded;
  const run = playRun(game, sim, { policy: policies.find((p) => p.name === policy) as never, seed, maxTurns: 500 });
  let state = game.init(seed, sim);
  let seen: Seen = { fights: 0, shown: 0, won: 0 };
  for (const action of run.log) {
    const fight = fightIn(state, sim.content, action);
    const shown = fight ? (game.preview(state, [fight], sim)[0] as unknown as { rows: FightRow[] }) : undefined;
    const step = game.reduce(state, action, sim);
    state = step.state;
    if (!shown) continue;
    const fought = step.beats.find((b) => b.type === 'encounters/fought') as unknown as {
      result: string;
      hurt: number;
      roll: number;
    };
    let to = 0;
    const row = shown.rows.find((r) => {
      to += r.weight;
      return fought.roll <= to;
    });
    expect({ result: row?.result, hurt: row?.hurt }, `${seed}, step ${step.state.kernel.step}`).toEqual({
      result: fought.result,
      hurt: fought.hurt,
    });
    const win = shown.rows.filter((r) => r.result === 'win').reduce((sum, r) => sum + r.weight, 0) / 100;
    seen = { fights: seen.fights + 1, shown: seen.shown + win, won: seen.won + (fought.result === 'win' ? 1 : 0) };
  }
  return seen;
}

describe('eb with the encounters kit', () => {
  it('validates the drift and the pit with no problems, and plays each to its golden runs', () => {
    for (const [folder, records, golden] of [
      [DRIFT, 36, 'drift-pilot'],
      [PIT, 23, 'pit-lanista'],
    ] as const) {
      const checked = eb(['validate', folder]);
      expect(checked.code, checked.out + checked.err).toBe(0);
      expect(checked.out).toMatch(new RegExp(`^${records} records: no problems, hash [0-9a-f]{16}\\.$`, 'm'));
      const file = resolve(import.meta.dirname, `fixtures/${golden}.golden.json`);
      const run = eb(['sim', folder, '--golden', file]);
      expect(run.code, run.out + run.err).toBe(0);
      expect(run.out).toContain('Refused offers: none.');
      expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${file}.`);
    }
  }, 60_000);

  it('rolls every fight of 300 seeds against the table it showed, the wins inside the chances shown', async () => {
    for (const [folder, policy, least] of [
      [DRIFT, 'pilot', 100],
      [PIT, 'lanista', 1500],
    ] as const) {
      const loaded = await load(folder);
      let all: Seen = { fights: 0, shown: 0, won: 0 };
      for (let seed = 1; seed <= 300; seed++) {
        const seen = fightsOf(loaded, policy, `fights-${seed}`);
        all = { fights: all.fights + seen.fights, shown: all.shown + seen.shown, won: all.won + seen.won };
      }
      expect(all.fights, folder).toBeGreaterThan(least);
      const { low, high } = wilson(all.won, all.fights);
      const mean = all.shown / all.fights / 100;
      expect(mean, `${folder}: ${all.won} won of ${all.fights}, ${(mean * 100).toFixed(1)}% shown`).toBeGreaterThan(
        low,
      );
      expect(mean).toBeLessThan(high);
    }
  }, 120_000);
});
