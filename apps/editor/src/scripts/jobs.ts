/**
 * The script worker's two jobs (M3.2, D38), as plain functions so tests run them in Node. Each
 * does what eb does with the same files: check reads the scripts as the compiler reads them and,
 * when asked, runs game.ts as `eb validate` runs it; play compiles the project with its game and
 * plays it as `eb sim --seeds <n> --policy <name>` plays it, so the report says the same.
 */
import { compileWithGame, gameOf, memorySource, projectGame, readKits, readScripts } from '@eb/compiler';
import { createGame, createRecordStore, formatSweep, MAX_TURNS, randomPolicy, seedsOf, sweep } from '@eb/core';
import { compareDiagnostics, type Diagnostic } from '@eb/schema';
import type { GameCatalog } from '@eb/script';
import type { CheckResult, PlayResult, SentFile } from './protocol.ts';

const sourceOf = (files: readonly SentFile[]) => memorySource(Object.fromEntries(files));

export async function checkJob(files: readonly SentFile[], run: boolean): Promise<CheckResult> {
  const source = sourceOf(files);
  const read = await readScripts(source);
  const diagnostics: Diagnostic[] = [...read.diagnostics];
  let game: GameCatalog | null = null;
  const ran = run && read.hasGame && read.compiled.size > 0;
  if (ran) {
    const scripted = gameOf(read, await readKits(source));
    if (scripted.kind === 'loaded') game = scripted.catalog;
    if (scripted.kind === 'failed') diagnostics.push(scripted.diagnostic);
  }
  return { ids: read.ids, hasGame: read.hasGame, diagnostics: diagnostics.sort(compareDiagnostics), ran, game };
}

/** The bots Run offers: the random one first, then the game's own, as eb sim's --policy takes them. */
export const policyNames = (game: GameCatalog): string[] => [randomPolicy.name, ...game.policies];

export async function playJob(files: readonly SentFile[], seeds: number, policyName: string): Promise<PlayResult> {
  const source = sourceOf(files);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  const errors = compiled.diagnostics.filter((d) => d.severity === 'error');
  if (scripted.kind !== 'loaded' || !compiled.pack) return { kind: 'refused', errors };
  const { modules, start, policies, metrics } = scripted.game;
  const policy = [randomPolicy, ...policies].find((p) => p.name === policyName);
  if (!policy) throw new Error(`No bot "${policyName}": this game has ${policyNames(scripted.catalog).join(', ')}`);
  const game = createGame({ modules, start });
  const sim = { content: createRecordStore(compiled.pack.records) };
  const { report } = sweep(game, sim, { seeds: seedsOf(seeds, 'seed'), policy, maxTurns: MAX_TURNS, metrics });
  return {
    kind: 'played',
    lines: formatSweep(compiled.pack.project.id, report, MAX_TURNS),
    ok: report.refused.count === 0,
  };
}
