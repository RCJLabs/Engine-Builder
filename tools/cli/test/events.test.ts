/**
 * eb with the events kit (M3.7, D45): the convoy, a slice of Wasteland Protocol, its road deck,
 * its raiders, traders and loan shark, and the consequences they book. Its game is its own
 * scripts, which eb runs with the four kits' modules joined. Played here, every choice made is
 * checked against what the event showed, its cost against what was paid, and every consequence
 * against the run it was booked in: none outlives it, as Wasteland's fix asks.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, type Beat, createGame, createRecordStore, type GameState, Rng, readPack } from '@eb/core';
import { type Cost, type EventRecord, type EventsSlice, eventRecord } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const CONVOY = resolve(import.meta.dirname, 'fixtures/convoy');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/convoy-scout.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('eb with the events kit', () => {
  it('validates the convoy with no problems, and builds a format 3 pack with its kits', () => {
    const checked = eb(['validate', CONVOY]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^15 records: no problems, hash [0-9a-f]{16}\.$/m);
    const out = join(mkdtempSync(join(tmpdir(), 'eb-convoy-')), 'convoy.pack.json');
    expect(eb(['build', CONVOY, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(pack.format).toBe(3);
    expect(pack.project.kits).toEqual(['inventory', 'economy', 'time', 'events']);
  });

  it('plays the convoy to its golden runs, with no offer refused', () => {
    const run = eb(['sim', CONVOY, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });
});

async function loadConvoy() {
  const source = folderSource(CONVOY);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the convoy does not load');
  const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
  return { game, sim: { content: createRecordStore(compiled.pack.records) } };
}

interface ChoiceShown {
  readonly id: string;
  readonly open: boolean;
  readonly cost?: Cost;
}

/** What booked each consequence the convoy's content books, as its receipt should say. */
const RECEIPTS: Readonly<Record<string, readonly [string, string]>> = {
  debt: ['loan-shark', 'borrow'],
  pursuit: ['raiders', 'fight'],
  thanks: ['survivor', 'take-in'],
};

/** The resources a step paid before its choice closed the event: pay-cost's changes, as the kit pays a cost first. */
function paidBefore(beats: readonly Beat[]): Record<string, number> {
  const paid: Record<string, number> = {};
  for (const beat of beats) {
    if (beat.type === 'events/chosen') break;
    if (beat.type === 'economy/changed') paid[beat.resource as string] = -(beat.by as number);
  }
  return paid;
}

describe('the convoy, played', () => {
  it('makes only the choices shown open, pays their costs exactly, and lands every consequence in its run', async () => {
    const { game, sim } = await loadConvoy();
    const landed: Record<string, number> = {};
    let choices = 0;
    let rolled = 0;
    for (let seed = 0; seed < 30; seed++) {
      const rng = Rng.create(`convoy-gate:${seed}`);
      let state: GameState = game.init(`gate-${seed}`, sim);
      const pending = new Set<string>();
      for (let turn = 0; turn < 300; turn++) {
        const offered = game.options(state, sim);
        if (offered.length === 0) break;
        const action = offered[rng.int(0, offered.length - 1)] as Action;
        let shown: ChoiceShown | undefined;
        if (action.type === 'events/choose') {
          const open = (state.events as EventsSlice).open;
          const [view] = game.preview(state, [{ effect: 'open-event', event: open }], sim);
          shown = (view?.choices as ChoiceShown[]).find((c) => c.id === action.choice);
          expect(shown?.open, `seed ${seed}, turn ${turn}: ${open}/${String(action.choice)}`).toBe(true);
          const record: EventRecord = eventRecord(sim.content, open);
          expect(shown?.cost).toEqual(record.choices.find((c) => c.id === action.choice)?.cost);
        }
        const step = game.reduce(state, action, sim);
        expect(step.accepted, `seed ${seed}, turn ${turn}`).toBe(true);
        if (shown) {
          expect(paidBefore(step.beats)).toEqual(shown.cost ?? {});
          choices += 1;
        }
        for (const beat of step.beats) {
          if (beat.type === 'events/rolled') rolled += 1;
          if (beat.type === 'events/booked') pending.add(beat.later as string);
          if (beat.type === 'events/landed') {
            expect([beat.event, beat.choice]).toEqual(RECEIPTS[beat.later as string]);
            landed[beat.later as string] = (landed[beat.later as string] ?? 0) + 1;
          }
          if (['events/landed', 'events/dropped', 'events/cancelled'].includes(beat.type)) {
            pending.delete(beat.later as string);
          }
        }
        state = step.state;
      }
      // Home, not stuck in an event, and owed nothing.
      expect(
        state.kernel.modes.map((m) => m.id),
        `seed ${seed}`,
      ).toEqual(['home']);
      expect([...pending], `seed ${seed}`).toEqual([]);
      expect(game.fact(state, 'events.booked', {}, sim)).toBe(0);
    }
    // Enough of each that the checks mean something.
    expect(choices).toBeGreaterThan(200);
    expect(rolled).toBeGreaterThan(50);
    expect(Object.keys(landed).sort()).toEqual(['debt', 'pursuit', 'thanks']);
  });
});
