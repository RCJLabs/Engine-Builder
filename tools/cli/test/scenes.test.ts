/**
 * eb with ink scenes (M3.11, D49): the gatehouse, a slice of Chooser of the Slain whose three dusk
 * scenes are ink files, compiled into talks as the project is read. eb validates and builds it,
 * plays it to its golden runs, and puts each check of a scene's talk at the scene's line. Played
 * here over 30 seeds, every option said is one its talk showed open, and every line of every
 * scene is reached and every option said.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, type GameState, Rng, readPack } from '@eb/core';
import { type DialogueSlice, TALK, type TalkRecord } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const GATEHOUSE = resolve(import.meta.dirname, 'fixtures/gatehouse');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/gatehouse-chooser.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

/** A copy of the gatehouse to break. */
function copy(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'eb-gatehouse-')), 'gatehouse');
  cpSync(GATEHOUSE, dir, { recursive: true });
  return dir;
}

describe('eb with ink scenes', () => {
  it('validates the gatehouse, its scenes among its records, and packs their talks', () => {
    const checked = eb(['validate', GATEHOUSE]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^14 records: no problems, hash [0-9a-f]{16}\.$/m);
    const out = join(mkdtempSync(join(tmpdir(), 'eb-gatehouse-')), 'gatehouse.pack.json');
    expect(eb(['build', GATEHOUSE, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(Object.keys(pack.records.talk ?? {}).sort()).toEqual(['first-dusk', 'keeper', 'letter']);
  });

  it('plays the gatehouse to its golden runs, with no offer refused', () => {
    const run = eb(['sim', GATEHOUSE, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });

  it('puts a scene’s own problems, and its talk’s checks, at the scene’s lines', () => {
    const dir = copy();
    const letter = join(dir, 'scenes/letter.ink');
    const lines = readFileSync(letter, 'utf8').split('\n');
    lines[5] = '"Your brother has the cough again." # speaker: father';
    lines[12] = '  # fx: set-flag(flag: sent-healr, to: true)';
    writeFileSync(letter, lines.join('\n'));
    writeFileSync(join(dir, 'scenes/keeper.ink'), 'VAR met = false\nHello.\n-> END\n');
    const checked = eb(['validate', dir]);
    expect(checked.code).toBe(1);
    expect(checked.out).toContain('scenes/keeper.ink:1');
    expect(checked.out).toMatch(/scenes\/keeper\.ink:1.*E046.*variables aren’t read/);
    expect(checked.out).toMatch(/scenes\/letter\.ink:6.*E005/);
    expect(checked.out).toMatch(/scenes\/letter\.ink:13.*E005/);
  });
});

async function loadGatehouse() {
  const source = folderSource(GATEHOUSE);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the gatehouse does not load');
  const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
  return { game, sim: { content: createRecordStore(compiled.pack.records) } };
}

describe('the gatehouse, played', () => {
  it('says only options shown open, and reaches every line of every scene and says every option', async () => {
    const { game, sim } = await loadGatehouse();
    const heard = new Set<string>();
    const said = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const rng = Rng.create(`gatehouse-gate:${seed}`);
      let state: GameState = game.init(`gate-${seed}`, sim);
      for (let turn = 0; turn < 200; turn++) {
        const offered = game.options(state, sim);
        if (offered.length === 0) break;
        const action = offered[rng.int(0, offered.length - 1)] as Action;
        if (action.type === 'dialogue/say') {
          const talk = (state.dialogue as DialogueSlice).open?.talk;
          const [view] = game.preview(state, [{ effect: 'open-talk', talk }], sim);
          const shown = ((view?.options ?? []) as { id: string; open: boolean }[]).find((o) => o.id === action.option);
          expect(shown?.open, `seed ${seed}, turn ${turn}: ${talk}/${String(action.option)}`).toBe(true);
        }
        const step = game.reduce(state, action, sim);
        expect(step.accepted, `seed ${seed}, turn ${turn}`).toBe(true);
        for (const beat of step.beats) {
          if (beat.type === 'dialogue/heard') heard.add(`${beat.talk}/${beat.line}`);
          if (beat.type === 'dialogue/said') said.add(`${beat.talk}/${beat.option}`);
        }
        state = step.state;
      }
      // Three days done, and no scene left open or waiting.
      expect(game.fact(state, 'gate.day', undefined, sim), `seed ${seed}`).toBe(4);
      const { open, waiting } = state.dialogue as DialogueSlice;
      expect([open, waiting], `seed ${seed}`).toEqual([undefined, []]);
    }
    const talks = sim.content.entries(TALK) as [string, TalkRecord][];
    const lines = talks.flatMap(([id, talk]) => talk.lines.map((line) => `${id}/${line.id}`));
    const options = talks.flatMap(([id, talk]) =>
      talk.lines.flatMap((l) => (l.options ?? []).map((o) => `${id}/${o.id}`)),
    );
    expect([...heard].sort()).toEqual(lines.sort());
    expect([...said].sort()).toEqual(options.sort());
  });
});
