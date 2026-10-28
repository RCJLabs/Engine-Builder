/**
 * What the tactics kit's tests share (M7.5, D87): Space-Wrecked's guns, crew, boarders and orders, by its
 * data/weapons.json, jobs.json and enemies.json at a2b4f62 (fixtures/space-wrecked/NOTICE); its seeded
 * generator, src/core/rng.js, as the kit's Rolls; an arena on a map; and its example ship, where
 * Space-Wrecked's (x, y) is the engine's (x, y − 1).
 */
import { gridOf, mapTextTiles, type PackTiles, type Tile } from '@eb/core';
import { packed, room, SHIP } from '../../core/test/tileMaps.ts';
import type { Arena, Rolls } from '../src/tactics/field.ts';
import type { Setting } from '../src/tactics/turns.ts';
import { type GunRecord, NUMBERS, type OrderRecord, type Team } from '../src/tactics/types.ts';

const gun = (
  least: number,
  most: number,
  close: number,
  mid: number,
  long: number,
  crit: number,
  extra: number,
  clip: number,
): GunRecord => ({
  damage: { least, most },
  accuracy: { close, mid, long },
  crit,
  'crit-damage': extra,
  clip,
});

export const GUNS: Readonly<Record<string, GunRecord>> = {
  rifle: gun(3, 5, 0, 10, 0, 10, 2, 4),
  shotgun: gun(4, 6, 20, -5, -30, 20, 3, 3),
  pistol: gun(2, 4, 15, 0, -15, 10, 1, 6),
  carbine: gun(3, 4, 10, 5, -10, 5, 2, 3),
  longrifle: gun(3, 5, -10, 5, 20, 15, 2, 3),
  dartgun: gun(2, 3, 10, 5, -20, 5, 1, 4),
};

/** Each job's order at rank 0. */
export const ORDERS: Readonly<Record<string, OrderRecord>> = {
  suppress: { kind: 'suppress', uses: 2, aim: -30 },
  weld: { kind: 'weld', uses: 2, rounds: 3 },
  patch: { kind: 'patch', uses: 2, hp: 3 },
  hustle: { kind: 'hustle', uses: 1, ap: 1 },
  mark: { kind: 'mark', uses: 2, aim: 15 },
  sedate: { kind: 'sedate', uses: 2, aim: 0 },
  kit: { kind: 'kit', uses: 2, armor: 1 },
};

interface Kind {
  readonly name: string;
  readonly side: Team;
  readonly hp: number;
  readonly aim: number;
  readonly defense: number;
  readonly mobility: number;
  readonly armor: number;
  readonly gun: string;
  readonly order: string | null;
}

const crew = (
  name: string,
  hp: number,
  aim: number,
  defense: number,
  mobility: number,
  armor: number,
  gun: string,
  order: string,
): Kind => ({
  name,
  side: 'crew',
  hp,
  aim,
  defense,
  mobility,
  armor,
  gun,
  order,
});

export const KINDS: Readonly<Record<string, Kind>> = {
  marine: crew('Marine', 10, 70, 0, 4, 1, 'rifle', 'suppress'),
  engineer: crew('Engineer', 8, 65, 5, 4, 0, 'shotgun', 'weld'),
  medic: crew('Medic', 8, 60, 10, 5, 0, 'pistol', 'patch'),
  pilot: crew('Pilot', 8, 65, 10, 5, 0, 'pistol', 'hustle'),
  scout: crew('Scout', 8, 75, 5, 5, 0, 'longrifle', 'mark'),
  xenobiologist: crew('Xenobiologist', 7, 60, 5, 4, 0, 'dartgun', 'sedate'),
  quartermaster: crew('Quartermaster', 10, 60, 0, 4, 1, 'carbine', 'kit'),
  pirate: {
    name: 'Pirate',
    side: 'foes',
    hp: 7,
    aim: 60,
    defense: 0,
    mobility: 4,
    armor: 0,
    gun: 'carbine',
    order: null,
  },
  brute: {
    name: 'Pirate brute',
    side: 'foes',
    hp: 11,
    aim: 55,
    defense: 0,
    mobility: 3,
    armor: 1,
    gun: 'shotgun',
    order: null,
  },
};

/** An arena on a map with Space-Wrecked's numbers, guns and orders. */
export function arenaOn(
  tiles: PackTiles,
  options: Partial<Pick<Arena, 'forgiving' | 'permadeath' | 'press'>> = {},
): Arena {
  return {
    grid: gridOf(tiles),
    numbers: NUMBERS,
    forgiving: false,
    permadeath: false,
    press: false,
    ...options,
    gun: (id) => GUNS[id] as GunRecord,
    order: (id) => ORDERS[id] as OrderRecord,
  };
}

/** A unit of a kind set out on a tile: its actor is the kind. */
export function set(kind: string, at: Tile, extra: Partial<Setting> = {}): Setting {
  const k = KINDS[kind] as Kind;
  return {
    side: k.side,
    actor: kind,
    at,
    hp: k.hp,
    most: k.hp,
    aim: k.aim,
    defense: k.defense,
    armor: k.armor,
    mobility: k.mobility,
    gun: k.gun,
    order: k.order,
    ...extra,
  };
}

const UINT32 = 4294967296;

/** Space-Wrecked's seedFrom: FNV-1a over UTF-16 code units, then murmur3's finalizer. */
export function seedFrom(input: string | number): number {
  if (typeof input === 'number') return input >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Space-Wrecked's mulberry32 as the kit's Rolls, with the draws it made. */
export function mulberry(seed: string | number): Rolls & { readonly drawn: number[] } {
  let state = seedFrom(seed);
  const drawn: number[] = [];
  return {
    drawn,
    int(min, max) {
      const a = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      state = a >>> 0;
      const value = min + Math.floor((((t ^ (t >>> 14)) >>> 0) / UINT32) * (max - min + 1));
      drawn.push(value);
      return value;
    },
  };
}

/** Rolls that come back as given, in order: the test says what each draw is. */
export function fixed(...values: number[]): Rolls & { readonly left: number[] } {
  const left = [...values];
  return {
    left,
    int(min, max) {
      const value = left.shift();
      if (value === undefined || value < min || value > max) throw new Error(`No roll from ${min} to ${max} was given`);
      return value;
    },
  };
}

/** The example ship, 11 × 5, as core's tile tests pack it. */
export const shipTiles = (): PackTiles =>
  packed(
    mapTextTiles(SHIP).map((row) => row.padEnd(11, ' ')),
    SHIP,
  );

export { room };
