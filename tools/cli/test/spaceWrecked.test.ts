/**
 * Space-Wrecked, acts 1 and 2 (M4.12's gate, D62): the game made from the original's data by the
 * import and played by its captain. It validates with no errors and only the warnings explained;
 * 500 seeds all settle a world, match their golden runs and between them reach every act 1–2
 * step of every quest; and a player pressing only what the screens draw can do everything the
 * captain does, and anything else the game offers on the way.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import {
  type Action,
  canonicalJson,
  compareGolden,
  createGame,
  createRecordStore,
  goldenOf,
  playRun,
  readGolden,
  sweep,
} from '@eb/core';
import { QUEST, type QuestRecord } from '@eb/kits';
import { actionFor, drawn, holds, screenStack } from '@eb/ui';
import type { Screen, Widget } from '@eb/ui/format';
import { childrenOf, listTakes } from '@eb/ui/format';
import { type Entry, playHost, type View } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const GAME = resolve(import.meta.dirname, '../../../games/space-wrecked');
const GOLDEN = resolve(import.meta.dirname, 'fixtures/space-wrecked-captain.golden.json');

async function load() {
  const source = folderSource(GAME);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error('Space-Wrecked does not load');
  const game = createGame({ modules: scripted.game.modules, start: scripted.game.start });
  const captain = (scripted.game.policies ?? []).find((p) => p.name === 'captain');
  if (!captain) throw new Error('No captain');
  return { game, captain, pack: compiled.pack, sim: { content: createRecordStore(compiled.pack.records) } };
}

/** Every stage of act 1 or 2: all but the act-3 stages, which a quest's colony objective marks. */
function stagesOf(content: ReturnType<typeof createRecordStore>): [string, string][] {
  return (content.entries(QUEST) as [string, QuestRecord][]).flatMap(([quest, record]) =>
    record.stages.filter((stage) => stage.id !== 'colony').map((stage) => [quest, stage.id] as [string, string]),
  );
}

/** Every button the drawn screens show now, with the action it would take. */
function pressable(screens: Readonly<Record<string, Screen>>, view: View): Action[] {
  const found: Action[] = [];
  const visit = (widget: Widget, entry?: Entry): void => {
    if (!holds(widget, view)) return;
    if (widget.widget === 'button') {
      const taken = actionFor(widget.action, view, entry);
      if (taken) found.push(taken);
    }
    if (widget.widget === 'map') {
      for (const node of view.map?.nodes ?? []) for (const t of node.travels) if (t.enabled) found.push(t.action);
    }
    if (widget.widget === 'list') {
      for (const each of view.lists[widget.of] ?? []) if (listTakes(widget, each.action)) visit(widget.item, each);
      return;
    }
    for (const child of childrenOf(widget)) visit(child, entry);
  };
  // The screens a player can open from the one on top count too: the refit screen, from the hangar.
  const shown = drawn(screenStack(screens, view.modes, [])).filter((s) => s.kind === 'screen');
  const opened = Object.values(screens).filter((s) => s.shows === undefined);
  for (const screen of [...shown.map((s) => s.screen), ...opened]) {
    for (const region of ['top', 'main', 'bottom'] as const) {
      const root = screen[region];
      if (root) visit(root);
    }
  }
  return found;
}

describe('Space-Wrecked', () => {
  it('validates with no errors, and only the warning the scripts explain', () => {
    const run = spawnSync(process.execPath, [CLI, 'validate', GAME], { cwd: tmpdir(), encoding: 'utf8' });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    // The scripts set room, which the lint can't see (W109 counts records, zones and screens only).
    // Heat's W108 went in M5.8, as the screens that show it count as reading it.
    const warnings = run.stdout.split('\n').flatMap((line) => /warning (W\d+)/.exec(line)?.[1] ?? []);
    expect(warnings).toEqual(['W109']);
    expect(run.stdout).toMatch(/records\/flag\/room\.json: warning W109/);
  });

  it('plays its 500 golden seeds with its captain: all settle, none refused, every act 1–2 step reached', async () => {
    const { game, captain, pack, sim } = await load();
    const golden = readGolden(JSON.parse(readFileSync(GOLDEN, 'utf8')));
    const seeds = Object.keys(golden.runs);
    expect(seeds).toHaveLength(500);
    const stages = stagesOf(sim.content);
    const metrics = [
      { fact: 'campaign.ending' },
      ...stages.map(([quest, stage]) => ({ fact: 'quests.reached', args: { quest, stage } })),
    ];
    const { report, runs } = sweep(game, sim, { seeds, policy: captain, maxTurns: golden.maxTurns, metrics });
    expect(report.ends).toEqual({ ended: 500, stopped: 0, capped: 0 });
    expect(report.refused.count).toBe(0);
    const [ending, ...reached] = report.metrics;
    expect(ending?.kind === 'values' && ending.values.map((v) => [v.value, v.runs])).toEqual([['settled', 500]]);
    const never = stages.filter(
      (_, i) => !(reached[i]?.kind === 'values' && reached[i].values.some((v) => v.value === true)),
    );
    expect(never).toEqual([]);
    const now = goldenOf(
      { game: pack.project.id, content: pack.hash, policy: captain.name, maxTurns: golden.maxTurns },
      runs,
    );
    const comparison = compareGolden(golden, now);
    expect(comparison.differences.slice(0, 3)).toEqual([]);
  }, 600_000);

  it('lets a player do all the captain does, and anything else on offer, pressing only what the screens draw', async () => {
    const { game, captain, pack, sim } = await load();
    const json = JSON.parse(JSON.stringify(pack)) as unknown;
    const seen = new Set<string>();
    const offered = new Set<string>();
    for (const seed of ['seed-0', 'seed-1', 'seed-2', 'seed-3']) {
      const { log, end } = playRun(game, sim, { seed, policy: captain });
      expect(end).toBe('ended');
      // The game played alongside, for what it offers at each step besides the captain's choice.
      let state = game.init(seed, sim);
      const host = playHost();
      const opened = host({ id: 0, kind: 'open', pack: json });
      if (opened.kind !== 'opened') throw new Error(JSON.stringify(opened));
      const started = host({ id: 0, kind: 'start', seed, saving: { edition: 'test' }, at: 0 });
      if (started.kind !== 'started') throw new Error(JSON.stringify(started));
      let view = started.view;
      const look = () => {
        for (const shown of screenStack(opened.screens, view.modes, [])) {
          expect(shown.kind, `modes ${view.modes.join(', ')}`).toBe('screen');
          if (shown.kind === 'screen') seen.add(shown.id);
        }
      };
      for (const [turn, action] of log.entries()) {
        look();
        const buttons = new Set(pressable(opened.screens, view).map((a) => canonicalJson(a)));
        const missing = [action, ...game.options(state, sim)].filter((a) => !buttons.has(canonicalJson(a)));
        expect(missing, `${seed} turn ${turn}, in ${view.modes.join(', ')}`).toEqual([]);
        for (const option of game.options(state, sim)) offered.add(option.type);
        const step = host({ id: turn + 1, kind: 'act', action, at: turn + 1 });
        if (step.kind !== 'stepped' || !step.accepted) throw new Error(JSON.stringify(step));
        view = step.view;
        state = game.reduce(state, action, sim).state;
      }
      // The ending's screen, drawn after the last step.
      look();
      expect(view.ended).toBe(true);
    }
    expect([...seen].sort()).toEqual(['docked', 'event', 'hall', 'hangar', 'run', 'settled', 'shop', 'start']);
    // Every kind of action the game has comes up in these runs, so each was held to a button.
    expect([...offered].sort()).toEqual([
      ...['campaign/begin', 'campaign/jobs', 'campaign/launch', 'campaign/pay', 'campaign/raid', 'campaign/shop'],
      ...['economy/buy', 'economy/leave', 'economy/sell', 'events/choose', 'maps/travel', 'refit/fit', 'refit/strip'],
      ...['roster/hire', 'roster/leave-hall', 'run/buy', 'run/hide', 'run/hire', 'run/onward', 'run/patch'],
      ...['run/regroup', 'run/scan', 'run/settle', 'run/survey', 'run/swap', 'run/undock'],
    ]);
  }, 120_000);
});
