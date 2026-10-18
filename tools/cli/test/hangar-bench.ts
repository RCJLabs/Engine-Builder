/**
 * Times the hangar (M3.3), a game made with the inventory and economy kits: a sweep of 1,000 seeds
 * with its worker bot, reported per run and per turn. Each turn lists the options, which for a
 * shop means a quote for every item on its shelf and in the bag, lets the bot choose and reduces
 * the action. The instrument behind the "hangar sweep" reading in ROADMAP.md.
 *
 *   node tools/cli/test/hangar-bench.ts
 */
import { join } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { createGame, createRecordStore, MAX_TURNS, seedsOf, sweep } from '@eb/core';
import { folderSource } from '../src/folderSource.ts';

const HANGAR = join(import.meta.dirname, 'fixtures/hangar');
const source = folderSource(HANGAR);
const scripted = await projectGame(source);
if (scripted.kind !== 'loaded') throw new Error('The hangar’s game didn’t load');
const compiled = await compileWithGame(source, scripted);
if (!compiled.pack) throw new Error('The hangar didn’t compile');
const { modules, start, policies, metrics } = scripted.game;
const policy = policies.find((p) => p.name === 'worker');
if (!policy) throw new Error('No worker bot');
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
