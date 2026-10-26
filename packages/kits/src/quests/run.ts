/**
 * Moving and ending quests (docs/specs/quests.md#running): a quest reaches a stage, logs it and
 * applies its effects, then is checked as each event is heard. Its objectives are done once, an
 * objective's Leads to comes before the stage's Then, and success before a slot's record gone,
 * before failure. Its slots are bound into each condition and effect before they are read (M3.10).
 * The slice is copied only when a quest changes, so an event that moves none leaves it shared.
 */
import type { Beat, Condition, DeepReadonly, ModuleContext } from '@eb/core';
import { own } from '../own.ts';
import { endJob, startJob } from './jobs.ts';
import { namedStage, questRecord, stageOf } from './records.ts';
import { bind, goneSlot, slotText } from './slots.ts';
import { trackEnded } from './tracking.ts';
import type { Count, QuestEntry, QuestRecord, QuestsSlice, Slot, Stage } from './types.ts';

type Ctx = ModuleContext<QuestsSlice>;
type Entry = DeepReadonly<QuestEntry>;

/** What the journal says of a stage that fails with no why of its own. */
export const FAILED = 'It failed.';
const DAY_STARTED = 'time/day-started';

export const entryOf = (ctx: Ctx, id: string): Entry | undefined => own(ctx.read().quests, id);
export const writeEntry = (ctx: Ctx, id: string) => own(ctx.write().quests, id) as QuestEntry;
/** The condition holds, the quest's slots bound in it. */
const holds = (ctx: Ctx, id: string, condition: Condition | undefined) =>
  condition !== undefined && ctx.check(bind(condition, entryOf(ctx, id)?.slots)) === true;

/** The event heard is the count's, with every argument value it gives, its slots bound. */
function counts(count: Count, heard: Beat, slots: Entry['slots']): boolean {
  if (heard.type !== count.event) return false;
  const args = bind(count.args ?? {}, slots);
  return Object.entries(args).every(([name, value]) => Object.hasOwn(heard, name) && heard[name] === value);
}

/**
 * The quest reaches the stage: the job it leaves is called off, the stage logged, its progress
 * emptied, `staged` raised, its effects applied, then its job rolled. It is checked next, by its
 * caller, or past a check's moves as the kit hears `staged`, and the check fails it at a stage that
 * fails. A stage reached again moves to the end of the log, so the log holds each stage once and a
 * quest that loops can't grow its save. The effects are one attempt, as a consequence the events
 * kit lands: one that refuses, a cost the party can't meet, undoes them with a beat saying why,
 * and never the action that moved the quest.
 */
export function enter(ctx: Ctx, id: string, stageId: string): void {
  const quest = questRecord(ctx.content, id);
  const stage = namedStage(ctx.content, id, stageId);
  const before = entryOf(ctx, id) as Entry;
  if (before.log.length > 0) endJob(ctx, id, stageOf(quest, before.stage));
  const entry = writeEntry(ctx, id);
  entry.stage = stageId;
  entry.log = [...entry.log.filter((reached) => reached !== stageId), stageId];
  entry.done = [];
  entry.counts = {};
  entry.days = 0;
  ctx.emit('staged', { quest: id, stage: stageId });
  const effects = stage.effects ?? [];
  if (effects.length > 0) {
    const slots = entry.slots;
    const result = ctx.attempt(() => {
      for (const effect of effects) ctx.apply(bind(effect, slots));
    });
    if (!result.ok) ctx.emit('refused', { quest: id, stage: stageId, reason: result.reason });
  }
  // Its effects may have moved the quest on, or ended it: then the job is not this stage's to run.
  const now = entryOf(ctx, id);
  if (now?.state === 'active' && now.stage === stageId) startJob(ctx, id, stage);
}

export function fail(ctx: Ctx, id: string, why: string): void {
  const before = entryOf(ctx, id);
  if (before?.state !== 'active') return;
  endJob(ctx, id, stageOf(questRecord(ctx.content, id), before.stage));
  const entry = writeEntry(ctx, id);
  entry.state = 'failed';
  entry.why = why;
  trackEnded(ctx, id);
  ctx.emit('failed', { quest: id, why });
}

/** Only ever for a quest the check found active, at a stage with no job. */
function finish(ctx: Ctx, id: string): void {
  writeEntry(ctx, id).state = 'done';
  trackEnded(ctx, id);
  ctx.emit('done', { quest: id });
}

/** Steps 1 and 2: the day counted, and each count objective not yet done that the event is. */
function tally(ctx: Ctx, id: string, stage: Stage, heard: Beat): void {
  if (heard.type === DAY_STARTED) writeEntry(ctx, id).days += 1;
  const { done, slots } = entryOf(ctx, id) as Entry;
  for (const objective of stage.objectives ?? []) {
    if (!objective.count || done.includes(objective.id) || !counts(objective.count, heard, slots)) continue;
    const entry = writeEntry(ctx, id);
    entry.counts = { ...entry.counts, [objective.id]: (own(entry.counts, objective.id) ?? 0) + 1 };
  }
}

/**
 * Step 3: each objective not yet done that is met now, in the order written, joins `done`. Step 4:
 * the first of them that leads somewhere ends the pass, and is where the quest goes.
 */
function markDone(ctx: Ctx, id: string, stage: Stage): string | undefined {
  for (const objective of stage.objectives ?? []) {
    const entry = entryOf(ctx, id) as Entry;
    if (entry.done.includes(objective.id)) continue;
    const met = objective.count
      ? (own(entry.counts, objective.id) ?? 0) >= objective.count.to
      : holds(ctx, id, objective['done-when']);
    if (!met) continue;
    const written = writeEntry(ctx, id);
    written.done = [...written.done, objective.id].sort();
    ctx.emit('objective-done', { quest: id, stage: stage.id, objective: objective.id });
    if (objective.next !== undefined) return objective.next;
  }
  return undefined;
}

type Move =
  | { readonly to: 'stage'; readonly stage: string }
  | { readonly to: 'done' }
  | { readonly to: 'fail'; readonly why: string };

/** The slot's record is gone (step 6): kept as lost, so it is gone once, and where the quest goes. */
function lose(ctx: Ctx, id: string, quest: QuestRecord, slot: Slot): Move {
  const entry = writeEntry(ctx, id);
  entry.lost = [...(entry.lost ?? []), slot.id].sort();
  ctx.emit('gone', { quest: id, slot: slot.id, record: own(entry.slots ?? {}, slot.id) as string });
  if (slot.gone !== undefined) return { to: 'stage', stage: slot.gone };
  return { to: 'fail', why: slotText(ctx.content, quest, entry.slots, slot.why ?? `{${slot.id}} is gone.`) };
}

/**
 * One check at the quest's stage: where it goes, if anywhere. Then (step 5) comes before a slot's
 * record gone (step 6), which comes before failing (step 7). A stage with a job waits for it.
 */
function progress(ctx: Ctx, id: string, quest: QuestRecord, stage: Stage, heard: Beat | undefined): Move | undefined {
  const why = (text: string) => slotText(ctx.content, quest, entryOf(ctx, id)?.slots, text);
  // Reaching it fails the quest, at this check, which follows at once: before it, its effects'
  // events may be heard, and with no objectives it would read as done.
  if (stage.fails === true) return { to: 'fail', why: why(stage.log ?? FAILED) };
  if (heard) tally(ctx, id, stage, heard);
  const branch = markDone(ctx, id, stage);
  if (branch !== undefined) return { to: 'stage', stage: branch };
  const entry = entryOf(ctx, id) as Entry;
  const objectives = stage.objectives ?? [];
  // A stage whose objectives all lead somewhere moves only by one of them.
  const needed = objectives.filter((objective) => objective.next === undefined);
  const done = objectives.length === 0 || (needed.length > 0 && needed.every((o) => entry.done.includes(o.id)));
  if (stage.job === undefined && done) {
    return stage.next === undefined ? { to: 'done' } : { to: 'stage', stage: stage.next };
  }
  const gone = goneSlot(ctx, quest, entry);
  if (gone !== undefined) return lose(ctx, id, quest, gone);
  if (holds(ctx, id, stage['fail-when']) || (stage.days !== undefined && entry.days >= stage.days)) {
    return { to: 'fail', why: why(stage.why ?? FAILED) };
  }
  return undefined;
}

/**
 * Checks an active quest at its stage, moving it on as its objectives are done: at most as many
 * stages as it has, so content that loops can't hold the game. `heard` counts once, at the stage
 * where it was heard.
 */
export function checkQuest(ctx: Ctx, id: string, heard?: Beat): void {
  const quest = questRecord(ctx.content, id);
  let event = heard;
  for (let moves = 0; moves < quest.stages.length; moves++) {
    const entry = entryOf(ctx, id);
    const stage = entry?.state === 'active' ? stageOf(quest, entry.stage) : undefined;
    if (stage === undefined) return;
    const move = progress(ctx, id, quest, stage, event);
    event = undefined;
    if (move === undefined) return;
    if (move.to === 'stage') enter(ctx, id, move.stage);
    else {
      if (move.to === 'done') finish(ctx, id);
      else fail(ctx, id, move.why);
      return;
    }
  }
}
