/**
 * What each choice of an event shows and whether it can be made (docs/specs/events.md#choosing).
 * The view the stage shows, the options a bot is offered and the action itself share one verdict,
 * so what is shown open is what choosing accepts, and the odds shown are the table rolled. A
 * talk's options are choices too, and share both (M3.8, docs/specs/dialogue.md).
 */
import {
  type Condition,
  type Effect,
  type EffectPreview,
  type FactArgs,
  type RecordStore,
  type RollRow,
  rollTable,
  type Truth,
} from '@eb/core';
import { lowest, resourceRecord } from '../economy/amounts.ts';
import { choiceOf, eventRecord } from './records.ts';
import type { Choice, Cost, Outcome } from './types.ts';

/** What a verdict reads, from an action's context, its options' view or a preview's. */
export interface Choosing {
  readonly content: RecordStore;
  fact(id: string, args?: FactArgs): unknown;
  check(condition: Condition): Truth;
  /** Whether costs are charged: only with the economy kit on (W119). */
  readonly costs: boolean;
}

export interface Short {
  readonly resource: string;
  readonly have: number;
  readonly need: number;
}

export type ChoiceVerdict<C extends Choice = Choice> =
  | { readonly ok: true; readonly choice: C }
  | { readonly ok: false; readonly reason: string; readonly data: Readonly<Record<string, unknown>> };

/** What a refusal says a choice was asked of: an event's, or a talk's option (M3.8). */
export interface Asked {
  /** The reason for a choice that isn't there or isn't shown. */
  readonly missing: string;
  /** Where it was asked: `{ event }`, or `{ talk }`. */
  readonly at: Readonly<Record<string, unknown>>;
  /** The key the choice's id goes under: `choice`, or `option`. */
  readonly key: string;
}

const holds = (choosing: Choosing, condition: Condition | undefined) =>
  condition === undefined || choosing.check(condition) === true;

/** The first resource of a cost the party is short of, in id order, as the economy kit's pay-cost finds it. */
export function shortOf(choosing: Choosing, cost: Cost | undefined): Short | undefined {
  if (!choosing.costs || cost === undefined) return undefined;
  for (const resource of Object.keys(cost).sort()) {
    const need = cost[resource] as number;
    const have = choosing.fact('economy.amount', { resource }) as number;
    if (have - need < lowest(resourceRecord(choosing.content, resource))) return { resource, have, need };
  }
  return undefined;
}

/** Whether a choice can be made now: there, shown, its needs held and its cost paid. A talk's options share it. */
export function verdictOn<C extends Choice>(
  choosing: Choosing,
  choice: C | undefined,
  id: unknown,
  asked: Asked,
): ChoiceVerdict<C> {
  const at = (named: unknown) => ({ ...asked.at, [asked.key]: named });
  if (!choice || !holds(choosing, choice.if)) return { ok: false, reason: asked.missing, data: at(String(id)) };
  if (!holds(choosing, choice.needs)) return { ok: false, reason: 'locked', data: at(choice.id) };
  const short = shortOf(choosing, choice.cost);
  if (short) return { ok: false, reason: 'cant-afford', data: { ...at(choice.id), ...short } };
  return { ok: true, choice };
}

/** Whether the event's choice of that id can be made now. */
export const choiceVerdict = (choosing: Choosing, event: string, id: unknown): ChoiceVerdict =>
  verdictOn(choosing, choiceOf(eventRecord(choosing.content, event), id), id, {
    missing: 'no-such-choice',
    at: { event },
    key: 'choice',
  });

/** The choices that can be made now, in the event's order: what `events/choose` offers. */
export function chooseOptions(choosing: Choosing, event: string): { choice: string }[] {
  return eventRecord(choosing.content, event)
    .choices.filter((choice) => choiceVerdict(choosing, event, choice.id).ok)
    .map((choice) => ({ choice: choice.id }));
}

/** Which roll from 1 to 100 picks which outcome: the roll effect's own table, so the odds shown are those rolled. */
export const outcomeTable = (outcomes: readonly Outcome[]): readonly RollRow[] =>
  rollTable({ effect: 'roll', outcomes } as Effect);

/**
 * One choice as the player sees it before choosing: its lock, its cost, and with the odds shown
 * what it does. An event's choice, or a talk's option.
 */
export function choiceShown(choosing: Choosing, choice: Choice, odds: boolean, preview: (e: Effect) => EffectPreview) {
  const needs = holds(choosing, choice.needs) ? undefined : choice.needs;
  const short = shortOf(choosing, choice.cost);
  return {
    id: choice.id,
    label: choice.label,
    ...(choice.cost ? { cost: choice.cost } : {}),
    open: needs === undefined && short === undefined,
    ...(needs !== undefined ? { needs } : {}),
    ...(short ? { short } : {}),
    ...(odds && choice.effects ? { effects: choice.effects.map(preview) } : {}),
    ...(odds && choice.outcomes
      ? {
          outcomes: outcomeTable(choice.outcomes).map(({ outcome }) => {
            const { chance, result, effects } = outcome as unknown as Outcome;
            return { chance, ...(result === undefined ? {} : { result }), effects: effects.map(preview) };
          }),
        }
      : {}),
  };
}

/** What an event shows: its choices whose If holds, each with its lock, cost and, with show-odds, its odds. */
export function eventView(choosing: Choosing, event: unknown, preview: (e: Effect) => EffectPreview) {
  const record = eventRecord(choosing.content, event);
  const shown = record.choices.filter((choice) => holds(choosing, choice.if));
  const odds = record['show-odds'] === true;
  return { event, choices: shown.map((choice) => choiceShown(choosing, choice, odds, preview)) };
}
