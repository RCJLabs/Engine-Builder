/**
 * Stat values (docs/specs/stats.md): a base, then every add, then every percent, rounded once and
 * kept within the stat's bounds (D42). The parts a screen shows come from the same function as
 * the value, so the two can't disagree, as Space-Wrecked's hit parts and its roll don't.
 */
import type { DeepReadonly, RecordStore } from '@eb/core';
import {
  ACTOR,
  type ActorRecord,
  type ActorState,
  STAT,
  STATUS,
  type StatRecord,
  type StatsSlice,
  type StatusRecord,
} from './types.ts';

function recordOf<T>(content: RecordStore, type: string, id: unknown, what: string): T {
  if (typeof id !== 'string' || !content.has(type, id)) throw new Error(`No ${what} "${String(id)}"`);
  return content.get(type, id) as T;
}

/** The records, or a thrown error: validation stops a reference to a missing one. */
export const statRecord = (content: RecordStore, id: unknown) => recordOf<StatRecord>(content, STAT, id, 'stat');
export const actorRecord = (content: RecordStore, id: unknown) => recordOf<ActorRecord>(content, ACTOR, id, 'actor');
export const statusRecord = (content: RecordStore, id: unknown) =>
  recordOf<StatusRecord>(content, STATUS, id, 'status');

export const lowest = (stat: StatRecord): number => stat.min ?? 0;
export const highest = (stat: StatRecord): number => stat.max ?? Number.POSITIVE_INFINITY;

const NONE: ActorState = {};
export const actorState = (slice: DeepReadonly<StatsSlice>, actor: string): DeepReadonly<ActorState> =>
  slice.actors[actor] ?? NONE;

/** The stacks the actor has of a status: the state's when it holds them, else 1 for one its record lists. */
export function stacksOf(content: RecordStore, slice: DeepReadonly<StatsSlice>, actor: string, status: string): number {
  const held = actorState(slice, actor).statuses?.[status];
  if (held !== undefined) return held.stacks;
  return actorRecord(content, actor).statuses?.includes(status) ? 1 : 0;
}

/** Every status the actor has now, in id order, with its stacks. */
export function statusesOf(content: RecordStore, slice: DeepReadonly<StatsSlice>, actor: string): [string, number][] {
  const ids = new Set([
    ...(actorRecord(content, actor).statuses ?? []),
    ...Object.keys(actorState(slice, actor).statuses ?? {}),
  ]);
  return [...ids]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((id): [string, number] => [id, stacksOf(content, slice, actor, id)])
    .filter(([, stacks]) => stacks > 0);
}

/** The base: the actor's record, or the stat's start, plus what add-to-stat added. */
export function baseOf(content: RecordStore, slice: DeepReadonly<StatsSlice>, actor: string, stat: string): number {
  const record = statRecord(content, stat);
  const given = actorRecord(content, actor).stats?.[stat] ?? record.start ?? lowest(record);
  return given + (actorState(slice, actor).raised?.[stat] ?? 0);
}

/** One thing that changes a value: a status (its stacks counted in) or a worn item, or the gear kit's sums. */
export interface Part {
  readonly kind: 'status' | 'item' | 'gear';
  readonly id: string;
  readonly add: number;
  readonly percent: number;
}

export interface StatParts {
  readonly base: number;
  readonly parts: readonly Part[];
  /** (base + adds) × (100 + percents) ÷ 100, rounded once, within the stat's bounds. */
  readonly value: number;
}

/** What the actor's statuses do to the stat, one part a status that touches it. */
export function statusParts(
  content: RecordStore,
  slice: DeepReadonly<StatsSlice>,
  actor: string,
  stat: string,
): Part[] {
  const parts: Part[] = [];
  for (const [id, stacks] of statusesOf(content, slice, actor)) {
    const touching = (statusRecord(content, id).modifiers ?? []).filter((m) => m.stat === stat);
    if (touching.length === 0) continue;
    const add = touching.reduce((sum, m) => sum + (m.add ?? 0), 0) * stacks;
    const percent = touching.reduce((sum, m) => sum + (m.percent ?? 0), 0) * stacks;
    parts.push({ kind: 'status', id, add, percent });
  }
  return parts;
}

function whole(n: number, what: string): bigint {
  if (!Number.isSafeInteger(n)) throw new Error(`A value's ${what} is a whole number: ${n}`);
  return BigInt(n);
}

/** a ÷ b rounded down, for any signs: BigInt division rounds toward zero. */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

/** (sum × (100 + percents)) ÷ 100 to the nearest whole number, halves up, then within the stat's bounds. */
export function settle(stat: StatRecord, sum: number, percents: number): number {
  const num = whole(sum, 'base and adds') * (100n + whole(percents, 'percents'));
  const rounded = floorDiv(2n * num + 100n, 200n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER) || rounded < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`A value of ${rounded} is past what the engine counts exactly`);
  }
  return Math.min(Math.max(Number(rounded), lowest(stat)), highest(stat));
}

/** The value and the parts that make it: the base, the statuses, then `worn` (the gear kit's). */
export function statParts(
  content: RecordStore,
  slice: DeepReadonly<StatsSlice>,
  actor: string,
  stat: string,
  worn: readonly Part[] = [],
): StatParts {
  const base = baseOf(content, slice, actor, stat);
  const parts = [...statusParts(content, slice, actor, stat), ...worn];
  const adds = parts.reduce((sum, p) => sum + p.add, 0);
  const percents = parts.reduce((sum, p) => sum + p.percent, 0);
  return { base, parts, value: settle(statRecord(content, stat), base + adds, percents) };
}

/** What damage leaves of a value: never below the stat's min. */
export function currentOf(
  content: RecordStore,
  slice: DeepReadonly<StatsSlice>,
  actor: string,
  stat: string,
  value: number,
): number {
  const damage = actorState(slice, actor).damage?.[stat] ?? 0;
  return Math.max(lowest(statRecord(content, stat)), value - damage);
}
