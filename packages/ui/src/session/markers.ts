/**
 * What the stage is told of the tracked quest (M6.6, D78, docs/specs/markers.md#what-the-stage-is-told):
 * each open objective with a target, its slots bound and its text as the journal shows it. Read from
 * the same `start-quest` preview the journal reads, so the marker and the journal say one thing.
 */
import type { QuestTarget } from '@eb/kits';

export interface QuestMarker {
  readonly quest: string;
  readonly objective: string;
  /** The objective's text, slots shown by name. */
  readonly text: string;
  readonly target: QuestTarget;
}

interface Shown {
  readonly state?: string;
  readonly objectives?: readonly {
    readonly id: string;
    readonly text: string;
    readonly done: boolean;
    readonly target?: QuestTarget;
  }[];
}

interface MarkerReading {
  fact(id: string, args?: Readonly<Record<string, unknown>>): unknown;
  preview(effect: { readonly effect: string; readonly [field: string]: unknown }): unknown;
}

/** The tracked quest's open objectives with a target, in the quest's order; none without the quests kit. */
export function markersOf(reading: MarkerReading, kits: readonly string[]): readonly QuestMarker[] {
  if (!kits.includes('quests')) return [];
  const quest = reading.fact('quests.tracked');
  if (typeof quest !== 'string') return [];
  const shown = reading.preview({ effect: 'start-quest', quest }) as Shown;
  if (shown.state !== 'active') return [];
  return (shown.objectives ?? []).flatMap((o) =>
    o.done || o.target === undefined ? [] : [{ quest, objective: o.id, text: o.text, target: o.target }],
  );
}
