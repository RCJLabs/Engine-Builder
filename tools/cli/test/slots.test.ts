/**
 * eb with M3.10's slots, repeats and jobs (D48): the school, a slice of Ludus. A booking at the
 * games repeats all season, each run for a gladiator picked at random from the roster, bought ones
 * among them, who is away until it ends and whose bout is rolled as the games begin; the rival
 * house challenges the school's most famous man. Played here with the game's own bot over 30
 * seeds: each quest is done and failed in some run, by its job and by its slot's record gone; the
 * bookings are filled by more than one gladiator; their bouts end near their odds; and at every
 * step the journal says what the state holds, a booked man is away, and no job is pending but at
 * its stage.
 */
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, type GameState, type RecordStore, Rng, turnFor } from '@eb/core';
import { QUEST, type QuestRecord, type QuestShown, type QuestsSlice, slotText, stageOf } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const SCHOOL = resolve(import.meta.dirname, 'fixtures/school');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/school-lanista.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('eb with slots, repeats and jobs', () => {
  it('validates the school with no problems', () => {
    const checked = eb(['validate', SCHOOL]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^11 records: no problems, hash [0-9a-f]{16}\.$/m);
  });

  it('plays the school to its golden runs, counting a booking’s runs done and failed', () => {
    const run = eb(['sim', SCHOOL, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toMatch(/^A booking at the games \(booking\): runs done: mean \d/m);
    expect(run.out).toMatch(/^A booking at the games \(booking\): runs failed: mean \d/m);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });
});

async function loadSchool() {
  const source = folderSource(SCHOOL);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the school does not load');
  const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
  const policy = scripted.game.policies.find((p) => p.name === 'lanista');
  if (!policy) throw new Error('the school has no lanista');
  return { game, policy, sim: { content: createRecordStore(compiled.pack.records) } };
}

/**
 * What the journal should say of a quest, from the state alone: its log with the names of its
 * slots' records, read from the content with the gladiators bought, and its slots.
 */
function expected(content: RecordStore, quest: QuestRecord, entry: QuestsSlice['quests'][string] | undefined) {
  if (!entry) return { state: 'waiting' };
  const said = (text: string) => slotText(content, quest, entry.slots, text);
  return {
    state: entry.state,
    log: entry.log.flatMap((id) => {
      const line = stageOf(quest, id)?.log;
      return line === undefined ? [] : [said(line)];
    }),
    slots: Object.keys(entry.slots ?? {}),
    ...(entry.why === undefined ? {} : { why: entry.why }),
  };
}

describe('the school, played', () => {
  it('fills, repeats, rolls and loses its slots as the state says, at every step', async () => {
    const { game, policy, sim } = await loadSchool();
    const quests = sim.content.entries(QUEST) as [string, QuestRecord][];
    const ends = new Set<string>();
    const booked = new Set<string>();
    const bouts: Record<string, number> = { won: 0, beaten: 0, killed: 0 };
    let checked = 0;
    for (let seed = 0; seed < 30; seed++) {
      const rng = Rng.create(`school-gate:${seed}`);
      let state: GameState = game.init(`gate-${seed}`, sim);
      for (let turn = 0; turn < 200; turn++) {
        const action = policy.choose(turnFor(game, sim, state, rng, turn)) as Action | null;
        if (action === null) break;
        const step = game.reduce(state, action, sim);
        expect(step.accepted, `seed ${seed}, turn ${turn}`).toBe(true);
        state = step.state;
        for (const beat of step.beats) {
          if (beat.type === 'quests/staged' && beat.quest === 'booking' && beat.stage in bouts) {
            bouts[beat.stage as string] = (bouts[beat.stage as string] ?? 0) + 1;
          }
          if (beat.type === 'quests/gone') ends.add(`${beat.quest} gone`);
        }
        const slice = state.quests as QuestsSlice;
        for (const [id, quest] of quests) {
          const shown = game.preview(state, [{ effect: 'start-quest', quest: id }], sim)[0] as unknown as QuestShown;
          const said = {
            state: shown.state,
            ...(shown.log ? { log: shown.log, slots: Object.keys(shown.slots ?? {}) } : {}),
            ...(shown.why === undefined ? {} : { why: shown.why }),
          };
          const entry = slice.quests[id];
          expect(said, `seed ${seed}, turn ${turn}, ${id}`).toEqual(expected(game.content(state, sim), quest, entry));
          // A job is pending only while its quest is at the job's stage.
          const atJob = entry?.state === 'active' && stageOf(quest, entry.stage)?.job !== undefined;
          expect(game.fact(state, 'time.pending', { timer: `quests-${id}` }, sim), `${seed} ${turn} ${id}`).toBe(atJob);
          checked += 1;
        }
        const booking = slice.quests.booking;
        if (booking?.state === 'active' && booking.lost === undefined) {
          const man = booking.slots?.man as string;
          booked.add(man);
          expect(game.fact(state, 'quests.away', { record: man }, sim), `${seed} ${turn}`).toBe(true);
        }
      }
      for (const [id, entry] of Object.entries((state.quests as QuestsSlice).quests)) ends.add(`${id} ${entry.state}`);
    }
    expect([...ends].filter((end) => !end.endsWith('active')).sort()).toEqual([
      'booking done',
      'booking failed',
      'booking gone',
      'rivalry done',
      'rivalry failed',
      'rivalry gone',
    ]);
    // Varro, and gladiators bought at market: made records fill slots too.
    expect(booked.has('varro')).toBe(true);
    expect([...booked].some((man) => /^(thrax|murmillo)-\d+$/.test(man))).toBe(true);
    // 60, 30 and 10 percent: each within about three standard deviations of what was rolled.
    const total = bouts.won + bouts.beaten + bouts.killed;
    expect(total).toBeGreaterThan(80);
    for (const [stage, chance] of [
      ['won', 0.6],
      ['beaten', 0.3],
      ['killed', 0.1],
    ] as const) {
      const sd = Math.sqrt(total * chance * (1 - chance));
      expect(Math.abs((bouts[stage] as number) - total * chance), stage).toBeLessThan(3 * sd);
    }
    expect(checked).toBeGreaterThan(30 * 2 * 40);
  });
});
