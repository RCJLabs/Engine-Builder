/**
 * Kaldvík (proof #2, M6.10, D82, docs/specs/kaldvik.md#the-gate) headless: eb validates it clean
 * and plays its bot through the walk and fight stage to a golden file; over those seeds the silver
 * comes home in most runs, every stage of every quest is reached in some run and no offer is
 * refused. Through the session, Halvard struck down goes down, not falls: no talk while he is, and
 * the stage's rise stands him at full health.
 */
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { type Action, createGame, createRecordStore, playRun, withPackWorld } from '@eb/core';
import { kitsInWorld, QUEST, type QuestRecord, walkedStage } from '@eb/kits';
import { openPack, startPlay } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const KALDVIK = resolve(import.meta.dirname, '../../../games/kaldvik');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/kaldvik-stranger.golden.json');
/** 50 seeds: 100 took 38 s through the stage on the dev container (2026-10-27), and the test plays them twice. */
const SEEDS = 50;

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

async function load() {
  const source = folderSource(KALDVIK);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('Kaldvík does not load');
  const { world, project } = compiled.pack;
  const modules = withPackWorld(kitsInWorld(scripted.game.modules, world), world);
  const game = createGame({ modules, start: scripted.game.start });
  const sim = { content: createRecordStore(compiled.pack.records) };
  return { game, sim, stage: walkedStage(project, world), policies: scripted.game.policies ?? [], compiled };
}

describe('Kaldvík', () => {
  it('validates clean: no errors and no warnings', () => {
    const checked = eb(['validate', KALDVIK]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^\d+ records: no problems, hash [0-9a-f]{16}\.$/m);
  });

  it(`plays ${SEEDS} seeds with the stranger to its golden runs, with no offer refused`, () => {
    // Written with `--policy stranger --seeds 50 --update`.
    const run = eb(['sim', KALDVIK, '--golden', GOLDEN]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All ${SEEDS} runs match ${GOLDEN}.`);
  }, 120_000);

  it('brings the silver home in most runs, and reaches every stage of every quest in some', async () => {
    const { game, sim, stage, policies } = await load();
    const bot = policies.find((p) => p.name === 'stranger');
    if (!bot) throw new Error('No stranger');
    const quests = sim.content.entries(QUEST) as [string, QuestRecord][];
    const stages = quests.flatMap(([quest, record]) => record.stages.map((s) => `${quest}/${s.id}`));
    const reached = new Set<string>();
    let home = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { state, refused } = playRun(game, sim, { seed: String(seed), policy: bot, stage });
      expect({ seed, refused }).toEqual({ seed, refused: [] });
      if (game.fact(state, 'kaldvik.ended', {}, sim) === true) home++;
      for (const at of stages) {
        const [quest, s] = at.split('/');
        if (game.fact(state, 'quests.reached', { quest, stage: s }, sim) === true) reached.add(at);
      }
    }
    expect(home / SEEDS).toBeGreaterThan(0.5);
    expect(stages.filter((at) => !reached.has(at))).toEqual([]);
    console.info(`Kaldvík: the silver home in ${home} of ${SEEDS} runs`);
  }, 120_000);

  it('lays Halvard down, struck to nothing, with no talk until the stage stands him up', async () => {
    const { compiled } = await load();
    const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
    if (!open.ok) throw new Error(open.message);
    const play = startPlay(open.opened.setup, 'kaldvik');
    const act = (action: Action) => play.act(action);
    const talk: Action = { type: 'world/use', space: 'shore', object: 'halvard' };
    for (let i = 0; i < 20 && play.view.world?.fight?.down.includes('halvard') !== true; i++)
      act({ type: 'fighting/hit', by: 'stranger', on: 'halvard', weapon: 'sword' });
    expect(play.view.world?.fight?.down).toEqual(['halvard']);
    expect(play.view.world?.fight?.fallen).toEqual([]);
    expect(act(talk).accepted).toBe(false);
    expect(act({ type: 'fighting/search', actor: 'halvard' }).accepted).toBe(false);
    expect(act({ type: 'fighting/rise', actor: 'halvard' }).accepted).toBe(true);
    expect(play.view.world?.fight?.down).toEqual([]);
    expect(act(talk).accepted).toBe(true);
  });
});
