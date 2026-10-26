/**
 * The ai kit (M6.3, D75, docs/specs/ai.md): behaviours as records of nodes, the NPC's running node
 * and its awareness of the player, kept in the sim and saved. Apart from the module so the schema's
 * checks read them without the sim code.
 */
import type { Condition, Effect } from '@eb/core';

/** The kit's id, which is its module's. */
export const AI = 'ai';
export const BEHAVIOUR = 'behaviour';

/** A length of game time in the calendar's units: `{ "minutes": 20 }`. */
export type Length = Readonly<Record<string, number>>;

/** A node that holds while each of its guards does, and then runs `do`. */
export interface GuardNode {
  readonly if?: Condition;
  /** In the calendar's `hours` unit, from inclusive to exclusive; the second before the first runs past midnight. */
  readonly hours?: readonly [number, number];
  readonly days?: readonly string[];
  /** Once left, it doesn't hold again until this long has passed. */
  readonly cooldown?: Length;
  readonly do: BehaviourNode;
}

export type BehaviourNode =
  | { readonly first: readonly BehaviourNode[] }
  | { readonly 'in-order': readonly BehaviourNode[] }
  | GuardNode
  | { readonly travel: string }
  | { readonly sleep: string }
  | { readonly work: string }
  | { readonly patrol: readonly string[]; readonly dwell?: Length }
  | { readonly sandbox: readonly string[]; readonly dwell: Length }
  | { readonly follow: 'player'; readonly distance?: number }
  | { readonly wait: Length }
  | { readonly face: 'player' }
  | { readonly effects: readonly Effect[] }
  // With the fighting kit on (M6.4, D76): the world module's fight, while it holds.
  | { readonly attack: 'player' };

export interface BehaviourRecord {
  readonly name?: string;
  readonly description?: string;
  readonly do: BehaviourNode;
}

/** The leaves, the packages and three actions: what `ai.doing` says an NPC is doing. */
export const LEAVES = [
  'travel',
  'sleep',
  'work',
  'patrol',
  'sandbox',
  'follow',
  'wait',
  'face',
  'effects',
  'attack',
] as const;
export type Leaf = (typeof LEAVES)[number];

/** Leaves that walk to one point and stay there. */
export const GOING: ReadonlySet<string> = new Set(['travel', 'sleep', 'work']);

/** An NPC's run of its behaviour, as the slice keeps it. */
export interface AiNpc {
  /** The running leaf, as child indices from the record's `do` ("" when it is a leaf), or none when nothing holds. */
  readonly leaf?: string;
  /** It finished: arrived, waited, faced or ran its effects. */
  readonly done?: true;
  /** A patrol's or sandbox's point it walks to or waits at. */
  readonly at?: string;
  /** A patrol's place in its list. */
  readonly step?: number;
  /** The tick its dwell or wait ends. */
  readonly until?: number;
  /** Each in-order's current child, by the in-order's path. */
  readonly orders?: Readonly<Record<string, number>>;
  /** Each guard cooling down, by its path: the tick it may hold again. */
  readonly cool?: Readonly<Record<string, number>>;
}

export interface AiSlice {
  readonly npcs: Readonly<Record<string, AiNpc>>;
  /** Each NPC's awareness of the player, 0 to 100: left out at 0. */
  readonly aware: Readonly<Record<string, number>>;
}

/** Senses, as an actor's fields leave them out (docs/specs/ai.md#perception). */
export const SIGHT_M = 15;
export const CONE_DEG = 120;
export const HEARING_M = 10;

export const LEVELS = ['unaware', 'suspicious', 'alerted'] as const;
export type Level = (typeof LEVELS)[number];
export const SUSPICIOUS_AT = 30;
export const ALERTED_AT = 70;
export const AWARE_MAX = 100;
/** Each noise heard. */
export const HEARD_GAIN = 20;
/** Quiet takes 1 for each this many real milliseconds: 5 a second. */
export const QUIET_MS = 200;

export const levelOf = (awareness: number): Level =>
  awareness >= ALERTED_AT ? 'alerted' : awareness >= SUSPICIOUS_AT ? 'suspicious' : 'unaware';
