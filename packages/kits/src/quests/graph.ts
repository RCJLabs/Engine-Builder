/**
 * Where a quest's stages lead (docs/specs/quests.md#checks, #the-map): by an objective's Leads to,
 * by Then when the stage can be done, by a set-stage of the quest among a stage's effects, and by a
 * job's outcomes (M3.10). A slot's gone stage can be reached from every stage. The schema's checks
 * and the editor's quest map both read this, so the map shows what the checks say.
 */
import type { Effect } from '@eb/core';
import type { QuestRecord, Stage } from './types.ts';

export interface Lead {
  readonly to: string;
  /** The field that leads, a JSON Pointer into the quest. */
  readonly path: string;
  readonly by: 'then' | 'objective' | 'effect' | 'job';
  /** The objective's id, for a Leads to. */
  readonly objective?: string;
  /** Nothing to wait on: a Then from a stage with no objectives, or a set-stage among its effects. */
  readonly atOnce: boolean;
  /** A job's outcome: its chance. */
  readonly chance?: number;
}

/**
 * Whether the stage can be done, so that its Then is taken: one whose objectives all lead elsewhere
 * moves only by them, and a job only by its outcomes.
 */
export const canBeDone = (stage: Stage): boolean =>
  stage.job === undefined &&
  ((stage.objectives ?? []).length === 0 || (stage.objectives ?? []).some((objective) => objective.next === undefined));

/** Whether reaching the stage can end the quest: done with no Then, failing, or able to fail. */
export function canEnd(stage: Stage): boolean {
  if (stage.fails === true) return true;
  if (stage.job !== undefined) return false;
  const waits = (stage.objectives ?? []).length > 0;
  if (waits && (stage['fail-when'] !== undefined || stage.days !== undefined)) return true;
  return canBeDone(stage) && stage.next === undefined;
}

const setsStage = (quest: string, effect: Effect): effect is Effect & { stage: string } =>
  effect.effect === 'set-stage' && effect.quest === quest && typeof effect.stage === 'string';

/** Where the stage at `index` of quest `id` leads, in the order written: its objectives, its Then, its effects. */
export function leadsFrom(id: string, stage: Stage, index: number): Lead[] {
  const at = `/stages/${index}`;
  const leads: Lead[] = [];
  (stage.objectives ?? []).forEach((objective, j) => {
    if (objective.next === undefined) return;
    const path = `${at}/objectives/${j}/next`;
    leads.push({ to: objective.next, path, by: 'objective', objective: objective.id, atOnce: false });
  });
  if (stage.next !== undefined && canBeDone(stage)) {
    leads.push({ to: stage.next, path: `${at}/next`, by: 'then', atOnce: (stage.objectives ?? []).length === 0 });
  }
  (stage.effects ?? []).forEach((effect, k) => {
    if (setsStage(id, effect))
      leads.push({ to: effect.stage, path: `${at}/effects/${k}/stage`, by: 'effect', atOnce: true });
  });
  (stage.job?.outcomes ?? []).forEach((outcome, k) => {
    const path = `${at}/job/outcomes/${k}/next`;
    leads.push({ to: outcome.next, path, by: 'job', atOnce: false, chance: outcome.chance });
  });
  return leads;
}

/** The stages slots go to when their record is gone, each once: reached from every stage. */
export const goneStages = (quest: QuestRecord): string[] => [
  ...new Set((quest.slots ?? []).flatMap((slot) => (slot.keeps !== undefined && slot.gone ? [slot.gone] : []))),
];

/** A slot whose record can be gone with no stage to go to: the quest can fail at any stage. */
const failsWhenGone = (quest: QuestRecord): boolean =>
  (quest.slots ?? []).some((slot) => slot.keeps !== undefined && slot.gone === undefined);

/** Each stage's leads by its id: the first stage of an id, as the kit reads it. */
export function leadsByStage(id: string, quest: QuestRecord): ReadonlyMap<string, readonly Lead[]> {
  const leads = new Map<string, Lead[]>();
  quest.stages.forEach((stage, i) => {
    if (!leads.has(stage.id)) leads.set(stage.id, leadsFrom(id, stage, i));
  });
  return leads;
}

/**
 * The fewest steps from the first stage, or from `also` (the stages set-stage names), to each
 * stage they reach. A stage missing from the map is reached by nothing.
 */
export function stepsFrom(id: string, quest: QuestRecord, also: readonly string[] = []): ReadonlyMap<string, number> {
  const leads = leadsByStage(id, quest);
  const first = quest.stages[0]?.id;
  const steps = new Map<string, number>();
  const queue: string[] = [];
  for (const root of first === undefined ? also : [first, ...also]) {
    if (!leads.has(root) || steps.has(root)) continue;
    steps.set(root, 0);
    queue.push(root);
  }
  // A gone stage is a step from wherever the quest is, the first stage among them.
  for (const gone of first === undefined ? [] : goneStages(quest)) {
    if (!leads.has(gone) || steps.has(gone)) continue;
    steps.set(gone, 1);
    queue.push(gone);
  }
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i] as string;
    for (const lead of leads.get(at) ?? []) {
      if (!leads.has(lead.to) || steps.has(lead.to)) continue;
      steps.set(lead.to, (steps.get(at) as number) + 1);
      queue.push(lead.to);
    }
  }
  return steps;
}

/** The stages from which the quest can end, by the leads from them to a stage that can (W126). */
export function endingStages(id: string, quest: QuestRecord): ReadonlySet<string> {
  const leads = leadsByStage(id, quest);
  const ending = new Set(quest.stages.filter(canEnd).map((stage) => stage.id));
  const gone = goneStages(quest);
  // A record gone can end the quest, or move it to a stage that can, from every stage.
  if (failsWhenGone(quest) || gone.some((stage) => ending.has(stage))) {
    for (const stage of quest.stages) ending.add(stage.id);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const [stage, from] of leads) {
      // A lead to a stage the quest doesn't have is E035's, so it isn't W126's too.
      if (ending.has(stage) || !from.some((lead) => ending.has(lead.to) || !leads.has(lead.to))) continue;
      ending.add(stage);
      grew = true;
    }
  }
  return ending;
}
