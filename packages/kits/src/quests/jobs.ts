/**
 * Timed jobs (M3.10, D48, docs/specs/quests.md#jobs): a stage's job is rolled as it is reached,
 * with `roll`'s table so the odds shown are the odds rolled, and its outcome kept as a timer of the
 * time module's that moves the quest there once the job is over. Time passed while the game was
 * closed, and the cap on it, are the time module's. Leaving the stage calls the job off.
 */
import { type Effect, type ModuleContext, rollTable } from '@eb/core';
import type { JobOutcome, QuestsSlice, Stage } from './types.ts';

type Ctx = ModuleContext<QuestsSlice>;

/** The timer that keeps a quest's job: one per quest, so a job reached again replaces it. */
export const jobTimer = (quest: string): string => `quests-${quest}`;

/** Which roll of 1 to 100 picks which outcome: `roll`'s table, which throws on chances not adding up to 100. */
export const jobTable = (stage: Stage) =>
  rollTable({ effect: 'roll', outcomes: stage.job?.outcomes ?? [] } as unknown as Effect);

/** Rolls the job, once, and keeps its outcome as the quest's timer. */
export function startJob(ctx: Ctx, quest: string, stage: Stage): void {
  const job = stage.job;
  if (job === undefined) return;
  const roll = ctx.rng('jobs').int(1, 100);
  const row = jobTable(stage).find((r) => roll <= r.to);
  const outcome = job.outcomes[row?.index ?? 0] as JobOutcome;
  ctx.apply({
    effect: 'schedule',
    timer: jobTimer(quest),
    after: job.takes,
    effects: [{ effect: 'set-stage', quest, stage: outcome.next }],
  });
}

/** Calls off the quest's job, when it is at one: its timer goes, and the outcome with it. */
export function endJob(ctx: Ctx, quest: string, stage: Stage | undefined): void {
  if (stage?.job !== undefined) ctx.apply({ effect: 'cancel-timer', timer: jobTimer(quest) });
}
