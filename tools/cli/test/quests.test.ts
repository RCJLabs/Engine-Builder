/**
 * eb with the quests kit (M3.9, D47): the yard, a slice of Space-Wrecked's first act. The miner's
 * debt with its deadline and two ways out, the drone bounty counted haul by haul, a name made in
 * three steps and the chief's trust, which waits on the bounty. Its game is its own scripts, which
 * eb runs with the five kits' modules joined, and eb adds each quest's state to the metrics.
 * Played here with the game's own bot over 30 seeds, every quest is done in some run and failed
 * in some run where it can fail, and every journal entry says what the state holds at every step.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, type GameState, Rng, readPack, turnFor } from '@eb/core';
import { QUEST, type QuestRecord, type QuestShown, type QuestsSlice, stageOf } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const YARD = resolve(import.meta.dirname, 'fixtures/yard');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/yard-scavenger.golden.json');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

describe('eb with the quests kit', () => {
  it('validates the yard with no problems, and builds a format 3 pack with its kits', () => {
    const checked = eb(['validate', YARD]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^9 records: no problems, hash [0-9a-f]{16}\.$/m);
    const out = join(mkdtempSync(join(tmpdir(), 'eb-yard-')), 'yard.pack.json');
    expect(eb(['build', YARD, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(pack.format).toBe(3);
    expect(pack.project.kits).toEqual(['inventory', 'economy', 'time', 'events', 'quests']);
  });

  it('plays the yard to its golden runs, reporting each quest’s state after the game’s own metrics', () => {
    const run = eb(['sim', YARD, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    const lines = run.out.trim().split('\n');
    const at = (start: string) => lines.findIndex((line) => line.startsWith(start));
    expect(at('quests done: ')).toBeGreaterThan(0);
    // The kit's, in the order of the quests' ids, after the game's.
    const quests = [
      'Drone bounty (bounty): ',
      'The miner’s debt (debt): ',
      'A name in the yard (ladder): ',
      'Trusted (trusted): ',
    ];
    expect(quests.map(at)).toEqual(quests.map((_, i) => at('quests done: ') + 1 + i));
    expect(lines[at('The miner’s debt (debt): ')]).toMatch(/^The miner’s debt \(debt\): (done|failed) \d/);
    expect(run.out).toContain('Refused offers: none.');
    expect(lines.at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  });
});

async function loadYard() {
  const source = folderSource(YARD);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('the yard does not load');
  const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
  const policy = scripted.game.policies.find((p) => p.name === 'scavenger');
  if (!policy) throw new Error('the yard has no scavenger');
  return { game, policy, sim: { content: createRecordStore(compiled.pack.records) } };
}

/** What the journal should say of a quest, from the state alone. */
function expected(quest: QuestRecord, entry: QuestsSlice['quests'][string] | undefined) {
  if (!entry) return { state: 'waiting' };
  const log = entry.log.flatMap((id) => stageOf(quest, id)?.log ?? []);
  const objectives = entry.state === 'active' ? (stageOf(quest, entry.stage)?.objectives ?? []) : [];
  return {
    state: entry.state,
    log,
    done: objectives.filter((o) => entry.done.includes(o.id)).map((o) => o.id),
    open: objectives.filter((o) => !entry.done.includes(o.id)).map((o) => o.id),
    ...(entry.why === undefined ? {} : { why: entry.why }),
  };
}

describe('the yard, played', () => {
  it('does and fails every quest that can be, with a journal that says what the state holds', async () => {
    const { game, policy, sim } = await loadYard();
    const quests = sim.content.entries(QUEST) as [string, QuestRecord][];
    const ends = new Set<string>();
    let checked = 0;
    for (let seed = 0; seed < 30; seed++) {
      const rng = Rng.create(`yard-gate:${seed}`);
      let state: GameState = game.init(`gate-${seed}`, sim);
      for (let turn = 0; turn < 200; turn++) {
        const action = policy.choose(turnFor(game, sim, state, rng, turn)) as Action | null;
        if (action === null) break;
        const step = game.reduce(state, action, sim);
        expect(step.accepted, `seed ${seed}, turn ${turn}`).toBe(true);
        state = step.state;
        const slice = state.quests as QuestsSlice;
        for (const [id, quest] of quests) {
          const shown = game.preview(state, [{ effect: 'start-quest', quest: id }], sim)[0] as unknown as QuestShown;
          const said = {
            state: shown.state,
            ...(shown.log ? { log: shown.log } : {}),
            ...(shown.state === 'waiting'
              ? {}
              : {
                  done: (shown.objectives ?? []).filter((o) => o.done).map((o) => o.id),
                  open: (shown.objectives ?? []).filter((o) => !o.done).map((o) => o.id),
                }),
            ...(shown.why === undefined ? {} : { why: shown.why }),
          };
          expect(said, `seed ${seed}, turn ${turn}, ${id}`).toEqual(expected(quest, slice.quests[id]));
          checked += 1;
        }
      }
      expect(
        state.kernel.modes.map((m) => m.id),
        `seed ${seed}`,
      ).toEqual(['gone']);
      for (const [id, entry] of Object.entries((state.quests as QuestsSlice).quests)) ends.add(`${id} ${entry.state}`);
    }
    // The ladder has nothing that fails it; the rest can fail.
    expect([...ends].filter((end) => !end.endsWith('active')).sort()).toEqual([
      'bounty done',
      'bounty failed',
      'debt done',
      'debt failed',
      'ladder done',
      'trusted done',
      'trusted failed',
    ]);
    // Enough that the checks mean something.
    expect(checked).toBeGreaterThan(30 * 4 * 12);
  });
});
