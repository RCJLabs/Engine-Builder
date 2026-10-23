/**
 * The hut (Phase 3's gate, D50): a season keeping a mountain hut, its game a script, the rest
 * records, two talks, an ink scene and a sheet, which the gate's e2e builds in the editor from an
 * empty project. eb validates it clean and plays it to its golden runs. Played here at random over
 * 60 seeds, every line of every talk is reached and every option said, every choice of the storm
 * taken, and every quest done in some run, and failed in some run where it can fail.
 */
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, type GameState, Rng } from '@eb/core';
import { TALK, type TalkRecord } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const HUT = resolve(import.meta.dirname, 'fixtures/hut');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/hut-keeper.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('eb and the hut', () => {
  it('validates the hut clean', () => {
    const checked = eb(['validate', HUT]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^25 records: no problems, hash [0-9a-f]{16}\.$/m);
  });

  it('plays the hut to its golden runs, with no offer refused', () => {
    const run = eb(['sim', HUT, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });
});

async function loadHut() {
  const source = folderSource(HUT);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the hut does not load');
  const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
  return { game, sim: { content: createRecordStore(compiled.pack.records) } };
}

describe('the hut, played at random', () => {
  it('reaches every line, says every option, takes every choice, and finishes every quest', async () => {
    const { game, sim } = await loadHut();
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const rng = Rng.create(`hut-gate:${seed}`);
      let state: GameState = game.init(`hut-${seed}`, sim);
      for (let turn = 0; turn < 400; turn++) {
        const offered = game.options(state, sim);
        if (offered.length === 0) break;
        const step = game.reduce(state, offered[rng.int(0, offered.length - 1)] as Action, sim);
        expect(step.accepted, `seed ${seed}, turn ${turn}`).toBe(true);
        for (const beat of step.beats) {
          if (beat.type === 'dialogue/heard') seen.add(`line ${beat.talk}/${beat.line}`);
          if (beat.type === 'dialogue/said') seen.add(`option ${beat.talk}/${beat.option}`);
          if (beat.type === 'events/chosen') seen.add(`choice ${beat.event}/${beat.choice}`);
          if (beat.type === 'quests/done') seen.add(`done ${beat.quest}`);
          if (beat.type === 'quests/failed') seen.add(`failed ${beat.quest}`);
        }
        state = step.state;
      }
      // The season ends and the hut closes in every run.
      expect(game.options(state, sim), `seed ${seed}`).toEqual([]);
    }
    const talks = sim.content.entries(TALK) as [string, TalkRecord][];
    const expected = [
      ...talks.flatMap(([id, talk]) => talk.lines.map((line) => `line ${id}/${line.id}`)),
      ...talks.flatMap(([id, talk]) => talk.lines.flatMap((l) => (l.options ?? []).map((o) => `option ${id}/${o.id}`))),
      'choice storm/search',
      'choice storm/lamp',
      'done supplies',
      'done guiding',
      'done loads',
      'failed guiding',
      'failed loads',
    ];
    expect([...seen].sort()).toEqual(expected.sort());
  });
});
