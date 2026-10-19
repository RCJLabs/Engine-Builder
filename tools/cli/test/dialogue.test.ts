/**
 * eb with the dialogue kit (M3.8, D46): the crag, a slice of Dirtbag. Marge, whose beta comes with
 * a bond, the gas money that costs, the send that is rolled, the gear in her van, and the ranger
 * at the gate. Its game is its own scripts, which eb runs with the three kits' modules joined.
 * Played here, every option said is checked against what its talk showed and its cost against
 * what was paid, and over 30 seeds every line of every talk is heard and every option said.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, type Beat, createGame, createRecordStore, type GameState, Rng, readPack } from '@eb/core';
import { type Cost, type DialogueSlice, optionOf, TALK, type TalkRecord, talkRecord } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const CRAG = resolve(import.meta.dirname, 'fixtures/crag');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/crag-climber.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('eb with the dialogue kit', () => {
  it('validates the crag with no problems, and builds a format 3 pack with its kits', () => {
    const checked = eb(['validate', CRAG]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^15 records: no problems, hash [0-9a-f]{16}\.$/m);
    const out = join(mkdtempSync(join(tmpdir(), 'eb-crag-')), 'crag.pack.json');
    expect(eb(['build', CRAG, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(pack.format).toBe(3);
    expect(pack.project.kits).toEqual(['inventory', 'economy', 'dialogue']);
  });

  it('plays the crag to its golden runs, with no offer refused', () => {
    const run = eb(['sim', CRAG, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });
});

async function loadCrag() {
  const source = folderSource(CRAG);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the crag does not load');
  const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
  return { game, sim: { content: createRecordStore(compiled.pack.records) } };
}

interface OptionShown {
  readonly id: string;
  readonly open: boolean;
  readonly cost?: Cost;
}

/** The resources a step paid before its option was kept as said: pay-cost's changes, as the kit pays a cost first. */
function paidBefore(beats: readonly Beat[]): Record<string, number> {
  const paid: Record<string, number> = {};
  for (const beat of beats) {
    if (beat.type === 'dialogue/said') break;
    if (beat.type === 'economy/changed') paid[beat.resource as string] = -(beat.by as number);
  }
  return paid;
}

describe('the crag, played', () => {
  it('says only the options shown open, pays their costs exactly, and hears every line and says every option', async () => {
    const { game, sim } = await loadCrag();
    const heard = new Set<string>();
    const said = new Set<string>();
    let sayings = 0;
    for (let seed = 0; seed < 30; seed++) {
      const rng = Rng.create(`crag-gate:${seed}`);
      let state: GameState = game.init(`gate-${seed}`, sim);
      for (let turn = 0; turn < 500; turn++) {
        const offered = game.options(state, sim);
        if (offered.length === 0) break;
        const action = offered[rng.int(0, offered.length - 1)] as Action;
        let shown: OptionShown | undefined;
        if (action.type === 'dialogue/say') {
          const talk = (state.dialogue as DialogueSlice).open?.talk;
          const [view] = game.preview(state, [{ effect: 'open-talk', talk }], sim);
          shown = ((view?.options ?? []) as OptionShown[]).find((o) => o.id === action.option);
          expect(shown?.open, `seed ${seed}, turn ${turn}: ${talk}/${String(action.option)}`).toBe(true);
          expect(shown?.cost).toEqual(optionOf(talkRecord(sim.content, talk), action.option)?.cost);
        }
        const step = game.reduce(state, action, sim);
        expect(step.accepted, `seed ${seed}, turn ${turn}`).toBe(true);
        if (shown) {
          expect(paidBefore(step.beats)).toEqual(shown.cost ?? {});
          sayings += 1;
        }
        for (const beat of step.beats) {
          if (beat.type === 'dialogue/heard') heard.add(`${beat.talk}/${beat.line}`);
          if (beat.type === 'dialogue/said') said.add(`${beat.talk}/${beat.option}`);
        }
        state = step.state;
      }
      // Home, with no talk open or waiting.
      expect(
        state.kernel.modes.map((m) => m.id),
        `seed ${seed}`,
      ).toEqual(['home']);
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
    // Enough that the checks mean something.
    expect(sayings).toBeGreaterThan(200);
  });
});
