/**
 * The tactics kit's records and state (M7.5, D87, docs/specs/tactics.md): Space-Wrecked's boarding fight on
 * a 2D space's tilemap. Sides take turns; each unit has action points to move, shoot, watch, reload, open a
 * door, steady a fallen friend or give its order.
 */
import type { Effect } from '@eb/core';

/** The kit's id, its module's id and the key of its slice. */
export const TACTICS = 'tactics';
export const BATTLE_RULES = 'battle-rules';
export const GUN = 'gun';
export const ORDER = 'order';
export const BATTLE = 'battle';
/** The mode a battle is fought in. */
export const FIGHTING_BATTLE = 'battle';

/** The numbers a battle reads, each with Space-Wrecked's value when a battle-rules record leaves it out. */
export interface Numbers {
  readonly 'action-points': number;
  readonly 'half-cover': number;
  readonly 'full-cover': number;
  readonly overwatch: number;
  readonly 'flank-crit': number;
  readonly close: number;
  readonly mid: number;
  readonly sight: number;
  readonly bleed: number;
  readonly 'forgiving-step': number;
  readonly 'forgiving-most': number;
}

/** Space-Wrecked's data/balance.json. */
export const NUMBERS: Numbers = Object.freeze({
  'action-points': 2,
  'half-cover': 20,
  'full-cover': 40,
  overwatch: 15,
  'flank-crit': 30,
  close: 3,
  mid: 7,
  sight: 20,
  bleed: 3,
  'forgiving-step': 10,
  'forgiving-most': 30,
});

/** records/battle-rules/<id>.json: the stats a unit's numbers come from, and the numbers. */
export interface BattleRulesRecord extends Partial<Numbers> {
  readonly name?: string;
  readonly health: string;
  readonly aim: string;
  readonly defense?: string;
  readonly armor?: string;
  readonly mobility: string;
}

/** records/gun/<id>.json */
export interface GunRecord {
  readonly name?: string;
  readonly damage: { readonly least: number; readonly most: number };
  readonly accuracy: { readonly close: number; readonly mid: number; readonly long: number };
  /** Percent. */
  readonly crit: number;
  readonly 'crit-damage': number;
  readonly clip: number;
}

export const ORDER_KINDS = ['suppress', 'weld', 'patch', 'hustle', 'mark', 'sedate', 'kit'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

/** The one number each kind reads. */
export const ORDER_NUMBER: Readonly<Record<OrderKind, 'aim' | 'rounds' | 'hp' | 'ap' | 'armor'>> = {
  suppress: 'aim',
  weld: 'rounds',
  patch: 'hp',
  hustle: 'ap',
  mark: 'aim',
  sedate: 'aim',
  kit: 'armor',
};

/** records/order/<id>.json: a crew member's order, usable `uses` times a fight. */
export interface OrderRecord {
  readonly name?: string;
  readonly kind: OrderKind;
  readonly uses: number;
  readonly aim?: number;
  readonly rounds?: number;
  readonly hp?: number;
  readonly ap?: number;
  readonly armor?: number;
}

export const TEAMS = ['crew', 'foes'] as const;
export type Team = (typeof TEAMS)[number];

/** A unit set out: an actor on an object's tile. */
export interface Post {
  readonly actor: string;
  readonly at: string;
}

/** records/battle/<id>.json */
export interface BattleRecord {
  readonly name?: string;
  readonly rules: string;
  readonly space: string;
  readonly crew: readonly Post[];
  readonly foes: readonly Post[];
  readonly first?: Team;
  readonly forgiving?: boolean;
  readonly permadeath?: boolean;
  /** The foes press on toward the crew when they see no one. */
  readonly press?: boolean;
  readonly win?: readonly Effect[];
  readonly lose?: readonly Effect[];
  /** A status given to each of the crew who ends the fight out or dead. */
  readonly falls?: string;
}

export const STATUSES = ['active', 'down', 'stable', 'dead', 'out'] as const;
export type Status = (typeof STATUSES)[number];

/** A unit in a battle. Its numbers are read from its actor as the battle starts, and kept. */
export interface Unit {
  /** c1, c2… for the crew and e1, e2… for the foes, in the order set out. */
  readonly id: string;
  readonly side: Team;
  readonly actor: string;
  at: readonly [number, number];
  hp: number;
  /** Its most hit points. */
  readonly most: number;
  readonly aim: number;
  readonly defense: number;
  armor: number;
  readonly mobility: number;
  /** Its gun, or null for none: it can't shoot, watch or reload. */
  readonly gun: string | null;
  ammo: number;
  /** Its order, or null: the foes have none. */
  readonly order: string | null;
  uses: number;
  ap: number;
  /** On overwatch. */
  watch: boolean;
  status: Status;
  /** Its side's turns left before one down bleeds out. */
  bleed: number;
  mark: { aim: number; turns: number } | null;
  /** What a suppression takes off its shots, below 0, or null. */
  suppressed: number | null;
  asleep: boolean;
  kitted: boolean;
}

/** A weld on a door, by edge key, holding through round `until`. */
export interface Weld {
  readonly key: string;
  readonly until: number;
}

export interface Battle {
  /** The battle record's id. */
  readonly battle: string;
  side: Team;
  readonly first: Team;
  round: number;
  misses: { crew: number; foes: number };
  /** The open doors' edge keys, sorted. */
  doors: string[];
  /** In the order made. */
  welds: Weld[];
  units: Unit[];
  /** The side that won, as the step that won it ends; a battle is never kept with one. */
  winner: Team | null;
}

export interface TacticsSlice {
  battle: Battle | null;
  /** Battles by id; none at 0. */
  fought: Record<string, number>;
  won: Record<string, number>;
  lost: Record<string, number>;
}

/** What happened, in order, for the stage to play back and the log to tell: a beat's kind and its data. */
export interface Told {
  readonly type: string;
  readonly [field: string]: unknown;
}

/** An action within a battle, as the kit's actions take it. */
export type Move =
  | { readonly type: 'move'; readonly unit: string; readonly to: readonly [number, number] }
  | { readonly type: 'shoot'; readonly unit: string; readonly target: string }
  | { readonly type: 'watch'; readonly unit: string }
  | { readonly type: 'reload'; readonly unit: string }
  | { readonly type: 'steady'; readonly unit: string; readonly target: string }
  | { readonly type: 'open'; readonly unit: string; readonly side: string }
  | { readonly type: 'order'; readonly unit: string; readonly target?: string; readonly side?: string }
  | { readonly type: 'end' };
