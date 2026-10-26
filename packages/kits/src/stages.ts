/**
 * The stage a headless run of a walked game plays with (M6.9, D81, docs/specs/runner.md#a-walked-games-stage-m69-d81):
 * the world's uses and zones, and with project.json's fighting the fighting kit's blows and searches.
 * eb sim's and the editor's Run, so both bots walk the same game.
 */
import { joinStages, type PackProject, type PackWorld, type Stage, worldDataOf, worldStage } from '@eb/core';
import { fightingStage } from './fighting/stage.ts';

/** None for a game without spaces, which its options alone move. */
export function walkedStage(project: PackProject, world: PackWorld | undefined): Stage | undefined {
  if (world === undefined) return undefined;
  const data = worldDataOf(world);
  const walk = worldStage(data);
  // A pack holds fighting only with the kit on and a space to fight in (format 13).
  if (project.fighting === undefined) return walk;
  return joinStages([walk, fightingStage(project.fighting, Object.keys(data.actors))]);
}
