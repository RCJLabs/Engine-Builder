/**
 * The quests kit's checks beyond its type file (M3.9, docs/specs/quests.md#checks): E035 for a
 * quest whose ids, leads or stages don't hold together; E043 for a condition or a set-stage naming
 * a stage or an objective its quest doesn't have; W120 for days in a game without a time module;
 * W124 for a stage nothing brings the quest to; W125 for a quest nothing starts; and W126 for a
 * stage from which the quest can never end. Conditions and set-stages can name a quest before its
 * record is read, so all but E035 and W120 wait for finish(). A count's event is E022's and E023's,
 * checked as a row's When is (sheetCheck.ts).
 */
import { type Effect, NAME_PATTERN } from '@eb/core';
import { endingStages, type Lead, leadsByStage, QUEST, type QuestRecord, questStepsFrom, type Stage } from '@eb/kits';
import type { SoundCondition } from './conditions.ts';
import type { DiagnosticCode } from './diagnostics.ts';
import { factTests } from './flagCheck.ts';
import type { Known } from './known.ts';
import { checkJob, checkSlots, isJobTimer, type SlotContext } from './questSlots.ts';
import { checkWhen, type SheetContext } from './sheetCheck.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;

const UNWRITABLE = "can't be written in a condition: use lowercase words joined by hyphens";
// The fields a stage that fails has no use for, since reaching it ends the quest.
const UNREAD_ON_FAILING = [
  ['objectives', 'Objectives'],
  ['next', 'Then'],
  ['fail-when', 'Fails when'],
  ['days', 'Days'],
] as const;

function checkIds(quest: QuestRecord, report: Report): void {
  const stages = new Set<string>();
  const objectives = new Set<string>();
  quest.stages.forEach((stage, i) => {
    const at = `/stages/${i}`;
    if (!NAME_PATTERN.test(stage.id)) report('E035', `${at}/id`, `"${stage.id}" ${UNWRITABLE}`);
    else if (stages.has(stage.id)) report('E035', `${at}/id`, `${stage.id} is a stage twice in this quest`);
    stages.add(stage.id);
    (stage.objectives ?? []).forEach((objective, j) => {
      const there = `${at}/objectives/${j}/id`;
      if (!NAME_PATTERN.test(objective.id)) report('E035', there, `"${objective.id}" ${UNWRITABLE}`);
      else if (objectives.has(objective.id)) {
        report(
          'E035',
          there,
          `${objective.id} is an objective twice in this quest: a condition names it by the quest alone`,
        );
      }
      objectives.add(objective.id);
    });
  });
}

function checkStage(stage: Stage, at: string, stages: ReadonlySet<string>, report: Report): void {
  const leads = (to: string | undefined, path: string) => {
    if (to !== undefined && !stages.has(to)) report('E035', path, `This quest has no stage ${to}`);
  };
  leads(stage.next, `${at}/next`);
  (stage.objectives ?? []).forEach((objective, j) => {
    const there = `${at}/objectives/${j}`;
    leads(objective.next, `${there}/next`);
    if (objective['done-when'] !== undefined && objective.count !== undefined) {
      report('E035', `${there}/count`, 'An objective is done by Done when or by Count, not both');
    } else if (objective['done-when'] === undefined && objective.count === undefined) {
      report('E035', there, 'An objective is done by Done when or by Count: give one');
    }
  });
  if (stage.fails !== true) return;
  for (const [key, label] of UNREAD_ON_FAILING) {
    if (stage[key] !== undefined) {
      report('E035', `${at}/${key}`, `Reaching a stage that fails ends the quest, so its ${label} is never read`);
    }
  }
}

/** Stages that lead round to each other with nothing to wait on, each loop once, at the edge leaving its first stage. */
function checkLoops(id: string, quest: QuestRecord, report: Report): void {
  const leads = leadsByStage(id, quest);
  const atOnce = (from: string) => (leads.get(from) ?? []).filter((lead) => lead.atOnce);
  const reported = new Set<string>();
  for (const stage of quest.stages) {
    if (reported.has(stage.id)) continue;
    const loop = loopFrom(stage.id, atOnce);
    if (!loop) continue;
    for (const each of loop.stages) reported.add(each);
    const said = [...loop.stages, stage.id].join(' → ');
    report('E035', loop.path, `Its stages lead round with nothing to wait on, which would never stop: ${said}`);
  }
}

/** A way from `start` back to it, breadth first so the shortest, with the lead it leaves `start` by. */
function loopFrom(start: string, leads: (from: string) => readonly Lead[]) {
  const queue = leads(start).map((lead) => ({ at: lead.to, stages: [start], path: lead.path }));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const { at, stages, path } = queue.shift() as (typeof queue)[number];
    if (at === start) return { stages, path };
    if (seen.has(at)) continue;
    seen.add(at);
    for (const lead of leads(at)) queue.push({ at: lead.to, stages: [...stages, at], path });
  }
  return undefined;
}

/** Each count's event and its arguments, as a row's When is checked (E022, E023), naming the quest's slots (E044). */
export function checkCounts(
  quest: QuestRecord,
  ctx: SheetContext,
  slotsAt?: (path: string) => Readonly<Record<string, string>>,
): void {
  quest.stages.forEach((stage, i) => {
    (stage.objectives ?? []).forEach((objective, j) => {
      const path = `/stages/${i}/objectives/${j}/count`;
      const slots = slotsAt?.(path);
      if (objective.count) checkWhen(objective.count, path, slots ? { ...ctx, slots } : ctx);
    });
  });
}

interface Named {
  readonly report: Report;
  readonly path: string;
  readonly quest: string;
  readonly kind: 'stage' | 'objective' | 'count';
  readonly name: string;
}

/** What a condition's test of a quests fact names, if anything: a stage, an objective, or a count objective. */
function namedBy(test: { fact: string; args?: Record<string, unknown>; op?: string; value?: unknown }) {
  const { quest } = test.args ?? {};
  if (typeof quest !== 'string') return undefined;
  const name = (kind: Named['kind'], value: unknown) =>
    typeof value === 'string' ? { quest, kind, name: value } : undefined;
  if (test.fact === 'quests.reached') return name('stage', test.args?.stage);
  if (test.fact === 'quests.objective') return name('objective', test.args?.objective);
  if (test.fact === 'quests.count') return name('count', test.args?.objective);
  if (test.fact === 'quests.stage' && (test.op === '==' || test.op === '!=')) return name('stage', test.value);
  return undefined;
}

/** Why the quest lacks what is named, or undefined. */
function lacks(record: QuestRecord, quest: string, kind: Named['kind'], name: string): string | undefined {
  const stages = record.stages.map((s) => s.id);
  if (kind === 'stage') {
    return stages.includes(name)
      ? undefined
      : `The quest ${quest} has no stage ${name}: its stages are ${stages.join(', ')}`;
  }
  const objectives = record.stages.flatMap((s) => s.objectives ?? []);
  const objective = objectives.find((o) => o.id === name);
  if (objective === undefined) {
    const has =
      objectives.length === 0 ? 'it has no objectives' : `its objectives are ${objectives.map((o) => o.id).join(', ')}`;
    return `The quest ${quest} has no objective ${name}: ${has}`;
  }
  if (kind === 'count' && objective.count === undefined) {
    return `${name} of ${quest} is done by Done when, not counted: its count is always 0`;
  }
  return undefined;
}

export class QuestChecks {
  private readonly days: boolean;
  private readonly quests = new Map<string, { readonly quest: QuestRecord; readonly report: Report }>();
  private readonly started = new Set<string>();
  /** Each set-stage's quest and stage, where it is. */
  private readonly staged: Named[] = [];
  private readonly named: Named[] = [];

  private readonly known: Known;
  private readonly slots: SlotContext;

  constructor(known: Known, ctx: Omit<SlotContext, 'known'>) {
    this.known = known;
    this.slots = { known, ...ctx };
    this.days = known.openEvents || known.events['time/day-started'] !== undefined;
  }

  /** One record that passed its schema. */
  record(type: string, id: string, value: unknown, report: Report): void {
    if (type !== QUEST) return;
    const quest = value as QuestRecord;
    checkIds(quest, report);
    const stages = new Set(quest.stages.map((stage) => stage.id));
    checkSlots(quest, report, this.slots);
    quest.stages.forEach((stage, i) => {
      checkStage(stage, `/stages/${i}`, stages, report);
      checkJob(stage, `/stages/${i}`, stages, report, this.known);
      if (stage.days !== undefined && !this.days) {
        report(
          'W120',
          `/stages/${i}/days`,
          'It counts days, which time/day-started says: this game has no time module',
        );
      }
    });
    checkLoops(id, quest, report);
    this.quests.set(id, { quest, report });
  }

  /** An effect whose schema passed: start-quest and set-stage start the quest they name (W125), and set-stage brings it to a stage (W124). */
  effect(report: Report, path: string, effect: Effect): void {
    if ((effect.effect === 'schedule' || effect.effect === 'cancel-timer') && isJobTimer(effect.timer)) {
      report(
        'E035',
        `${path}/timer`,
        'Timers named quests-… are the quests kit’s own, for its jobs: name it otherwise',
      );
    }
    if (effect.effect !== 'start-quest' && effect.effect !== 'set-stage') return;
    if (typeof effect.quest !== 'string') return;
    this.started.add(effect.quest);
    if (effect.effect === 'set-stage' && typeof effect.stage === 'string') {
      this.staged.push({ report, path: `${path}/stage`, quest: effect.quest, kind: 'stage', name: effect.stage });
    }
  }

  /** A condition's tests that name a stage or an objective of a quest. */
  condition(report: Report, sound: SoundCondition): void {
    for (const [inner, test] of factTests(sound.tree, '')) {
      const named = namedBy(test);
      if (named) this.named.push({ report, path: sound.at(inner), ...named });
    }
  }

  finish(): void {
    for (const { report, path, quest, kind, name } of [...this.named, ...this.staged]) {
      const record = this.quests.get(quest)?.quest;
      const why = record === undefined ? undefined : lacks(record, quest, kind, name);
      if (why !== undefined) report('E043', path, why);
    }
    for (const [id, { quest, report }] of this.quests) {
      if (quest['at-start'] !== true && quest['starts-when'] === undefined && !this.started.has(id)) {
        report(
          'W125',
          '',
          'Nothing starts it: it isn’t at the start, has no Starts when, and no Start a quest or Set a quest’s stage names it',
        );
      }
      this.reach(id, quest, report);
    }
  }

  /** W124 for each stage nothing brings the quest to; W126 for each it reaches that can't lead to an end. */
  private reach(id: string, quest: QuestRecord, report: Report): void {
    const set = this.staged.filter((each) => each.quest === id).map((each) => each.name);
    const reached = questStepsFrom(id, quest, set);
    const ending = endingStages(id, quest);
    const seen = new Set<string>();
    quest.stages.forEach((stage, i) => {
      if (seen.has(stage.id)) return;
      seen.add(stage.id);
      if (!reached.has(stage.id)) {
        report(
          'W124',
          `/stages/${i}/id`,
          'Nothing brings the quest here: no Then or Leads to from its first stage, and no Set a quest’s stage',
        );
      } else if (!ending.has(stage.id)) {
        report(
          'W126',
          `/stages/${i}/id`,
          'The quest can never end from here: no Then or Leads to reaches a stage that is done, fails or can fail',
        );
      }
    });
  }
}
