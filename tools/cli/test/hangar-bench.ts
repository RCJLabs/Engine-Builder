/**
 * Times a fixture made with kits: a sweep of 1,000 seeds with one of its bots, reported per run and
 * per turn. The hangar (M3.3, the inventory and economy kits) with its worker bot by default; the
 * arena (M3.4, all four kits) with its lanista; the steading (M3.5, with factions and time) with its
 * jarl; the crew (M3.6, with the roster) with its captain; the convoy (M3.7, with the events kit)
 * with its scout; the crag (M3.8, with the dialogue kit) with its climber; the yard (M3.9, with the
 * quests kit) with its scavenger; the school (M3.10, with slots, repeats and jobs) with its lanista; the gatehouse (M3.11, with ink scenes) with its chooser. Each turn lists the options, lets the bot choose and reduces the
 * action. The instrument behind the sweep readings in ROADMAP.md, one for each.
 *
 *   node tools/cli/test/hangar-bench.ts [fixture] [bot]
 */
import { join } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { createGame, createRecordStore, MAX_TURNS, seedsOf, sweep } from '@eb/core';
import { folderSource } from '../src/folderSource.ts';

const [fixture = 'hangar', bot = 'worker'] = process.argv.slice(2);
const source = folderSource(join(import.meta.dirname, 'fixtures', fixture));
const scripted = await projectGame(source);
if (scripted.kind !== 'loaded') throw new Error(`The ${fixture}’s game didn’t load`);
const compiled = await compileWithGame(source, scripted);
if (!compiled.pack) throw new Error(`The ${fixture} didn’t compile`);
const { modules, start, policies, metrics } = scripted.game;
const policy = policies.find((p) => p.name === bot);
if (!policy) throw new Error(`No ${bot} bot`);
const game = createGame({ modules, start });
const sim = { content: createRecordStore(compiled.pack.records) };

const started = performance.now();
const { report } = sweep(game, sim, { seeds: seedsOf(1000, 'bench'), policy, maxTurns: MAX_TURNS, metrics });
const elapsed = performance.now() - started;
const turns = (report.turns?.mean ?? 0) * report.runs;
console.log(
  `${report.runs} runs, ${Math.round(turns)} turns in ${Math.round(elapsed)} ms: ` +
    `${((elapsed * 1000) / report.runs).toFixed(0)} µs a run, ${((elapsed * 1000) / turns).toFixed(1)} µs a turn`,
);
