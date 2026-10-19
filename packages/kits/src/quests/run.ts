/**
 * Starting, moving and ending quests (docs/specs/quests.md#running): a quest reaches a stage,
 * logs it and applies its effects, then is checked as each event is heard. Its objectives are
 * done once, an objective's Leads to comes before the stage's Then, and success before failure.
 * The slice is copied only when a quest changes, so an event that moves none leaves it shared.
 */
import type { Beat, Condition, DeepReadonly, ModuleContext } from '@eb/core';
import { own } from '../own.ts';
import { namedStage, questRecord, stageOf } from './records.ts';
import { type Count, QUEST, type QuestEntry, type QuestsSlice, type Stage } from './types.ts';

type Ctx = ModuleContext<QuestsSlice>;
type Entry = DeepReadonly<QuestEntry>;

/** What the journal says of a stage that fails with no why of its own. */
export const FAILED = 'It failed.';
const DAY_STARTED = 'time/day-started';

const holds = (ctx: Ctx, condition: Condition | undefined) => condition !== undefined && ctx.check(condition) === true;
const entryOf = (ctx: Ctx, id: string): Entry | undefined => own(ctx.read().quests, id);
const writeEntry = (ctx: Ctx, id: string) => own(ctx.write().quests, id) as QuestEntry;

/** The event heard is the count's, with every argument value it gives. */
function counts(count: Count, heard: Beat): boolean {
  if (heard.type !== count.event) return false;
  return Object.entries(count.args ?? {}).every(([name, value]) => Object.hasOwn(heard, name) && heard[name] === value);
}

/**
 * The quest reaches the stage: logged, its progress emptied, `staged` raised, its effects applied.
 * It is checked next, by its caller, or past a check's moves as the kit hears `staged`, and the
 * check fails it at a stage that fails. A stage reached again moves to the end of the log, so the
 * log holds each stage once and a quest that loops can't grow its save. The effects are one
 * attempt, as a consequence the events kit lands: one that refuses, a cost the party can't meet,
 * undoes them with a beat saying why, and never the action that moved the quest.
 */
function enter(ctx: Ctx, id: string, stageId: string): void {
  const stage = namedStage(ctx.content, id, stageId);
  const entry = writeEntry(ctx, id);
  entry.stage = stageId;
  entry.log = [...entry.log.filter((reached) => reached !== stageId), stageId];
  entry.done = [];
  entry.counts = {};
  entry.days = 0;
  ctx.emit('staged', { quest: id, stage: stageId });
  const effects = stage.effects ?? [];
  if (effects.length > 0) {
    const result = ctx.attempt(() => {
      for (const effect of effects) ctx.apply(effect);
    });
    if (!result.ok) ctx.emit('refused', { quest: id, stage: stageId, reason: result.reason });
  }
}

export function fail(ctx: Ctx, id: string, why: string): void {
  if (entryOf(ctx, id)?.state !== 'active') return;
  const entry = writeEntry(ctx, id);
  entry.state = 'failed';
  entry.why = why;
  ctx.emit('failed', { quest: id, why });
}

/** Only ever for a quest the check found active. */
function finish(ctx: Ctx, id: string): void {
  writeEntry(ctx, id).state = 'done';
  ctx.emit('done', { quest: id });
}

/** Steps 1 and 2: the day counted, and each count objective not yet done that the event is. */
function tally(ctx: Ctx, id: string, stage: Stage, heard: Beat): void {
  if (heard.type === DAY_STARTED) writeEntry(ctx, id).days += 1;
  const { done } = entryOf(ctx, id) as Entry;
  for (const objective of stage.objectives ?? []) {
    if (!objective.count || done.includes(objective.id) || !counts(objective.count, heard)) continue;
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
      : holds(ctx, objective['done-when']);
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

/** One check at the quest's stage: where it goes, if anywhere. Then (step 5) comes before failing (step 6). */
function progress(ctx: Ctx, id: string, stage: Stage, heard: Beat | undefined): Move | undefined {
  // Reaching it fails the quest, at this check, which follows at once: before it, its effects'
  // events may be heard, and with no objectives it would read as done.
  if (stage.fails === true) return { to: 'fail', why: stage.log ?? FAILED };
  if (heard) tally(ctx, id, stage, heard);
  const branch = markDone(ctx, id, stage);
  if (branch !== undefined) return { to: 'stage', stage: branch };
  const { done, days } = entryOf(ctx, id) as Entry;
  const objectives = stage.objectives ?? [];
  // A stage whose objectives all lead somewhere moves only by one of them.
  const needed = objectives.filter((objective) => objective.next === undefined);
  if (objectives.length === 0 || (needed.length > 0 && needed.every((objective) => done.includes(objective.id)))) {
    return stage.next === undefined ? { to: 'done' } : { to: 'stage', stage: stage.next };
  }
  if (holds(ctx, stage['fail-when']) || (stage.days !== undefined && days >= stage.days)) {
    return { to: 'fail', why: stage.why ?? FAILED };
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
    const move = progress(ctx, id, stage, event);
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

/** Starts a waiting quest at its first stage, or `at`; one that has started is left as it is. */
export function startQuest(ctx: Ctx, id: string, at?: string): void {
  const quest = questRecord(ctx.content, id);
  if (entryOf(ctx, id) !== undefined) return;
  const stage = namedStage(ctx.content, id, at ?? quest.stages[0]?.id).id;
  ctx.write().quests[id] = { state: 'active', stage, log: [], done: [], counts: {}, days: 0 };
  ctx.emit('started', { quest: id, stage });
  enter(ctx, id, stage);
  checkQuest(ctx, id);
}

/** Moves an active quest to the stage, or starts a waiting one there; a quest that has ended is left. */
export function setStage(ctx: Ctx, id: string, stage: string): void {
  const entry = entryOf(ctx, id);
  if (entry === undefined) startQuest(ctx, id, stage);
  else if (entry.state === 'active') {
    enter(ctx, id, stage);
    checkQuest(ctx, id);
  }
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

/** Starts each waiting quest whose start condition holds, in the order of their ids. */
export function startWaiting(ctx: Ctx): void {
  for (const id of ctx.content.ids(QUEST)) {
    if (entryOf(ctx, id) !== undefined) continue;
    if (holds(ctx, questRecord(ctx.content, id)['starts-when'])) startQuest(ctx, id);
  }
}
