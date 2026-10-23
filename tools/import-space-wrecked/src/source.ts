/**
 * Space-Wrecked's data/ as the import reads it: the files it uses, typed as far as the import
 * reads them. Each file is read as it is; nothing here changes a value.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Stats = Record<string, number>;
export type Range = readonly [number, number];
export type Text = Readonly<Record<string, string>>;

/** A number from balance.json that the import works out with: a missing one stops the import. */
export function balanceOf(source: Source, key: string): number {
  const value = source.balance[key];
  if (value === undefined) throw new Error(`No balance number ${key}`);
  return value;
}

export interface Module {
  readonly id: string;
  readonly name: string;
  readonly base?: string;
  readonly manufacturer: string;
  readonly category?: string;
  readonly size?: Range;
  readonly stats: Partial<Stats>;
  readonly tags?: readonly string[];
  readonly cost: number;
  readonly heal?: number;
  readonly damage?: number;
  readonly shield?: number;
  readonly intercept?: number;
}

export interface Fighter {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly aim: number;
  readonly defense: number;
  readonly mobility: number;
  readonly armor: number;
  readonly weapon: string;
}

export interface Job extends Fighter {
  readonly station?: Stats;
  readonly ranks?: readonly { readonly name: string; readonly text: string }[];
}

export interface Trait {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly effects: Stats;
}

export interface Outcome {
  readonly chance: number;
  readonly text: string;
  readonly effects: Readonly<Record<string, unknown>>;
}

export interface Choice {
  readonly id: string;
  readonly label: string;
  readonly needs?: Stats;
  readonly outcomes: readonly Outcome[];
}

export interface Event {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly text: string;
  readonly quest?: string;
  readonly choices: readonly Choice[];
}

export interface Step {
  readonly act: number;
  readonly job?: string;
  readonly event?: string;
  readonly done?: readonly string[];
  readonly cold?: readonly string[];
  readonly next: string;
  readonly said?: string;
  readonly effects?: Stats;
  readonly place?: { readonly name: string; readonly text: string };
}

export interface Quest {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly background?: string;
  readonly side?: string;
  readonly companion?: string;
  readonly start?: { readonly event: string; readonly choice: string };
  readonly steps: readonly Step[];
}

export interface Contract {
  readonly id: string;
  readonly title: string;
  readonly mission: string;
  readonly clients: readonly string[];
  readonly sites: readonly string[];
  readonly encounter: string;
  readonly against?: string;
  readonly credits: Range;
  readonly drops?: { readonly chance: number; readonly parts: Stats };
  readonly once?: boolean;
  readonly quest?: string;
  readonly crates?: number;
  readonly turns?: number;
  readonly pitch: string;
}

export interface Twist {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly enemies?: number;
  readonly pay?: number;
  readonly loud?: boolean;
  readonly missions?: readonly string[];
  readonly sight?: number;
  readonly deadline?: number;
}

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly blurb: string;
  readonly side?: string;
}

export interface District {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly clients: readonly Person[];
  readonly sites: readonly { readonly id: string; readonly name: string; readonly blurb: string }[];
  readonly shop: {
    readonly name: string;
    readonly dealer: string;
    readonly pitch: string;
    readonly size: number;
    readonly parts: Stats;
  };
}

export interface Pursuer {
  readonly name: string;
  readonly side: string;
  readonly blurb: string;
  readonly levels: Text;
  readonly hunters: readonly string[];
  readonly raiders: string;
  readonly payment?: { readonly name: string; readonly text: string; readonly credits: number; readonly heat: number };
  readonly run: { readonly levels: Text; readonly hunters: string; readonly taskForce: string; readonly faced: string };
}

export interface Background {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly pursuer: Pursuer;
  readonly launch: { readonly text: string; readonly escaped: string };
  readonly captains: readonly string[];
  readonly district: string;
  readonly start: {
    readonly credits: number;
    readonly parts: Stats;
    readonly crew: readonly string[];
    readonly ship: { readonly placements: readonly { readonly type: string }[] };
  };
}

export interface Ship {
  readonly id: string;
  readonly name: string;
  readonly side?: string;
  readonly crew: number;
  readonly party?: string;
  readonly scrap?: Range;
  readonly salvage?: number;
  readonly tactics?: { readonly flee?: number };
}

export interface NodeKind {
  readonly id: string;
  readonly name: string;
  readonly names?: string;
  readonly charted?: boolean;
  readonly safe?: boolean;
  readonly hides?: boolean;
  readonly events?: boolean;
  readonly text: string;
  readonly ships?: readonly { readonly ship: string; readonly weight: number; readonly from?: number }[];
}

export interface Recruits {
  readonly first: readonly string[];
  readonly last: readonly string[];
  readonly backgrounds: readonly {
    readonly id: string;
    readonly name: string;
    readonly text: string;
    readonly jobs: readonly string[];
    readonly traits: readonly string[];
    readonly traitCount: number;
    readonly fights: Range;
  }[];
}

export interface Companion {
  readonly id: string;
  readonly name: string;
  readonly side: string;
  readonly job: string;
  readonly traits: readonly string[];
  readonly fights: number;
  readonly past: string;
  readonly chain: string;
  readonly loyalty: string;
}

/** Every file the import reads, by its name in data/ without `.json`. */
export interface Source {
  readonly balance: Stats;
  readonly campaign: { readonly acts: readonly Readonly<Record<string, unknown>>[] };
  readonly frames: {
    readonly frames: readonly { readonly id: string; readonly maxModules: number; readonly minThrustToMass: number }[];
  };
  readonly manufacturers: { readonly manufacturers: readonly { readonly id: string; readonly name: string }[] };
  readonly modules: { readonly modules: readonly Module[]; readonly categories: readonly { readonly id: string }[] };
  readonly weapons: {
    readonly weapons: readonly { readonly id: string; readonly name: string; readonly damage: Range }[];
  };
  readonly jobs: { readonly jobs: readonly Job[] };
  readonly traits: { readonly traits: readonly Trait[] };
  readonly enemies: { readonly enemies: readonly Fighter[] };
  readonly encounters: {
    readonly encounters: readonly { readonly id: string; readonly name: string; readonly enemies: readonly string[] }[];
  };
  readonly ships: { readonly ships: readonly Ship[] };
  readonly factions: {
    readonly sides: readonly { readonly id: string; readonly name: string; readonly blurb: string }[];
    readonly stations: Readonly<Record<string, string>>;
  };
  readonly events: { readonly drops: Readonly<Record<string, Stats>>; readonly events: readonly Event[] };
  readonly quests: { readonly quests: readonly Quest[] };
  readonly contracts: {
    readonly boardSize: number;
    readonly twistChance: number;
    readonly missions: readonly {
      readonly id: string;
      readonly name: string;
      readonly brief: string;
      readonly loud?: boolean;
    }[];
    readonly twists: readonly Twist[];
    readonly jobs: readonly Contract[];
  };
  readonly districts: { readonly districts: readonly District[] };
  readonly backgrounds: { readonly backgrounds: readonly Background[] };
  readonly recruits: Recruits;
  readonly companions: { readonly companions: readonly Companion[] };
  readonly sectors: {
    readonly columns: number;
    readonly rows: Range;
    readonly extraLinkChance: number;
    readonly counts: Readonly<Record<string, Range>>;
    readonly mix: Stats;
    readonly nodes: readonly NodeKind[];
    readonly names: Readonly<Record<string, readonly string[]>>;
  };
  readonly worlds: {
    readonly system: { readonly worlds: number; readonly text: string };
    readonly kinds: readonly {
      readonly id: string;
      readonly name: string;
      readonly text: string;
      readonly landing: string;
    }[];
    readonly names: Readonly<Record<string, readonly string[]>>;
  };
}

export const FILES = [
  'balance',
  'campaign',
  'frames',
  'manufacturers',
  'modules',
  'weapons',
  'jobs',
  'traits',
  'enemies',
  'encounters',
  'ships',
  'factions',
  'events',
  'quests',
  'contracts',
  'districts',
  'backgrounds',
  'recruits',
  'companions',
  'sectors',
  'worlds',
] as const;

export function readSource(folder: string): Source {
  const source: Record<string, unknown> = {};
  for (const file of FILES) source[file] = JSON.parse(readFileSync(join(folder, `${file}.json`), 'utf8'));
  return source as unknown as Source;
}
