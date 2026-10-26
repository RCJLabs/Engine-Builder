/**
 * Starting quests (docs/specs/quests.md#starting): by an effect, with the game, or once a start
 * condition holds; each heard event checks the quests active before it. A quest's slots are
 * filled as it starts (M3.10): one whose slots can't be filled doesn't start. A quest that repeats
 * runs again once it has ended, fresh, its past runs counted.
 */
import type { Beat } from '@eb/core';
import { own } from '../own.ts';
import { namedStage, questRecord } from './records.ts';
import { checkQuest, enter, entryOf, writeEntry } from './run.ts';
import { fillSlots, type Reader } from './slots.ts';
import { trackStarted } from './tracking.ts';
import { QUEST, type QuestEntry, type QuestsContext } from './types.ts';

type Ctx = QuestsContext;

/**
 * Starts a waiting quest at its first stage, or `at`, or one that repeats and has ended; one
 * active, or ended for good, is left as it is. Returns the slot that couldn't be filled, if the
 * quest didn't start for want of one.
 */
export function startQuest(ctx: Ctx, id: string, at?: string): string | undefined {
  const quest = questRecord(ctx.content, id);
  const before = entryOf(ctx, id);
  if (before !== undefined && (before.state === 'active' || quest.repeats !== true)) return undefined;
  const stage = namedStage(ctx.content, id, at ?? quest.stages[0]?.id).id;
  // A run of a quest that repeats tries its world slots' last picks last (M6.7, D79).
  const fill = fillSlots(ctx, quest, (n) => ctx.rng('slots').int(0, n - 1), before?.slots);
  if ('unfilled' in fill) return fill.unfilled;
  const entry: QuestEntry = { state: 'active', stage, log: [], done: [], counts: {}, days: 0 };
  if (quest.slots !== undefined) entry.slots = fill.slots;
  if (before !== undefined) {
    const past = before.times ?? { done: 0, failed: 0 };
    entry.times = {
      done: past.done + (before.state === 'done' ? 1 : 0),
      failed: past.failed + (before.state === 'failed' ? 1 : 0),
    };
  }
  ctx.write().quests[id] = entry;
  trackStarted(ctx, id);
  ctx.emit('started', { quest: id, stage });
  enter(ctx, id, stage);
  checkQuest(ctx, id);
  return undefined;
}

/**
 * Whether start-quest would start the quest now (quests.can-start, M6.9): waiting, or ended and
 * repeating, with its slots filled as the journal's preview fills them. A talk's option that starts
 * a job reads it, so the job isn't offered once nothing is left to fill its slots.
 */
export function canStart(reader: Reader, id: string): boolean {
  const quest = questRecord(reader.content, id);
  const before = own(reader.read().quests, id);
  if (before !== undefined && (before.state === 'active' || quest.repeats !== true)) return false;
  return !('unfilled' in fillSlots(reader, quest, undefined, before?.slots));
}

/**
 * Moves an active quest to the stage, or starts a waiting one there, or one that repeats and has
 * ended; a quest ended for good is left. Returns the slot that couldn't be filled, as startQuest does.
 */
export function setStage(ctx: Ctx, id: string, stage: string): string | undefined {
  const entry = entryOf(ctx, id);
  if (entry?.state === 'active') {
    enter(ctx, id, stage);
    checkQuest(ctx, id);
    return undefined;
  }
  return startQuest(ctx, id, stage);
}

/**
 * What the kit does as each event is heard, its own included, so one quest can wait on another:
 * waiting quests whose start holds start, then each quest active before is checked, by id.
 */
export function hear(ctx: Ctx, event: Beat): void {
  const { quests } = ctx.read();
  const active = Object.keys(quests).filter((id) => own(quests, id)?.state === 'active');
  startWaiting(ctx);
  for (const id of active.sort()) checkQuest(ctx, id, event);
}

/**
 * Starts each waiting quest whose start holds, in the order of their ids: one with `starts-when`
 * once it holds, and one that starts with the game but whose slots couldn't be filled then. A quest
 * that repeats and has ended starts again once its `starts-when`, having stopped holding, holds again.
 */
export function startWaiting(ctx: Ctx): void {
  for (const id of ctx.content.ids(QUEST)) {
    const quest = questRecord(ctx.content, id);
    const starts = quest['starts-when'];
    const entry = entryOf(ctx, id);
    if (entry === undefined) {
      if (quest['at-start'] === true || (starts !== undefined && ctx.check(starts) === true)) startQuest(ctx, id);
    } else if (entry.state !== 'active' && quest.repeats === true && starts !== undefined) {
      if (ctx.check(starts) !== true) {
        if (entry.again !== true) writeEntry(ctx, id).again = true;
      } else if (entry.again === true) startQuest(ctx, id);
    }
  }
}
