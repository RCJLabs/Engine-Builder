/**
 * Each quest's state at the end of a run, as a sweep's metrics (docs/specs/quests.md#the-bots):
 * `eb sim` and the editor's Run add these after a game's own when the quests kit is on, so a quest
 * no run finishes, or one left active, shows without the game listing it.
 */
import type { MetricSpec, RecordStore } from '@eb/core';
import { questRecord } from './records.ts';
import { QUEST, QUESTS } from './types.ts';

/** The kits' metrics for a game with these kits on: one per quest, its state in shares of the runs. */
export function kitMetrics(on: readonly string[], content: RecordStore): MetricSpec[] {
  if (!on.includes(QUESTS)) return [];
  return content.ids(QUEST).map((id) => ({
    fact: 'quests.state',
    args: { quest: id },
    label: `${questRecord(content, id).name} (${id})`,
  }));
}
