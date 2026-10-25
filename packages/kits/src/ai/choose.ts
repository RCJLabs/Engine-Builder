/**
 * Which leaf of a behaviour runs now (docs/specs/ai.md#behaviours): down from the record's `do`, a
 * `first` takes its first child that holds, a guard its `do` while each of its guards holds and it
 * isn't cooling down, an `in-order` its current child; a leaf always holds. A plain function of
 * what the NPC's run keeps and what the sim reads now.
 */
import type { Condition, Truth } from '@eb/core';
import { childPath, childrenOf, kindOf } from './nodes.ts';
import type { AiNpc, BehaviourNode, GuardNode } from './types.ts';

/** What a check reads of the game now: its tick, the hour and weekday when the calendar has them, and its conditions. */
export interface Now {
  readonly tick: number;
  readonly hour?: number;
  readonly weekday?: string;
  check(condition: Condition): Truth;
}

/** Whether the hour is within [from, to), the second before the first running past midnight. */
export function withinHours(hour: number, [from, to]: readonly [number, number]): boolean {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

function guardHolds(guard: GuardNode, path: string, run: AiNpc | undefined, now: Now): boolean {
  const cooling = run?.cool?.[path];
  if (cooling !== undefined && now.tick < cooling) return false;
  if (guard.hours && (now.hour === undefined || !withinHours(now.hour, guard.hours))) return false;
  if (guard.days && (now.weekday === undefined || !guard.days.includes(now.weekday))) return false;
  return guard.if === undefined || now.check(guard.if) === true;
}

/** The path of the leaf that runs, or undefined when nothing holds. */
export function chooseLeaf(node: BehaviourNode, run: AiNpc | undefined, now: Now, path = ''): string | undefined {
  const kind = kindOf(node);
  const children = childrenOf(node);
  if (kind === 'first') {
    for (let i = 0; i < children.length; i++) {
      const found = chooseLeaf(children[i] as BehaviourNode, run, now, childPath(path, i));
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (kind === 'in-order') {
    const at = Math.min(run?.orders?.[path] ?? 0, children.length - 1);
    const child = children[at];
    return child === undefined ? undefined : chooseLeaf(child, run, now, childPath(path, at));
  }
  if (kind === 'guard') {
    if (!guardHolds(node as GuardNode, path, run, now)) return undefined;
    return chooseLeaf((node as GuardNode).do, run, now, childPath(path, 0));
  }
  return kind === undefined ? undefined : path;
}
