/**
 * The starter sprites' rooms (M7.3, D85, docs/specs/rooms.md#the-starter-rooms): the keep's inside seen side
 * on, a slot 48 by 32 art pixels. Each room has its side walls, two pixels each so two rooms side by side
 * make afterglass's four-pixel wall, a back wall of dark stone, and at its top the four-pixel slab the floor
 * above stands on. Walkers stand on the room's foot, which is the top of the slab below, so nothing of the
 * floor is drawn under their feet. The hall is two slots wide; a ladder of eight pixels tiles upward.
 */
import type { Colour } from './palette.ts';
import { type Frame, hash, Sheet } from './raster.ts';

export const SLOT: readonly [number, number] = [48, 32];
const [, HEIGHT] = SLOT;
/** Where the slab of the floor above begins: the room's inside is the rows below. */
const CEILING = HEIGHT - 4;

/** The back wall in courses of 12 by 7, the slab above, and the side walls. */
function shell(f: Frame, seed: number): void {
  const w = f.width;
  for (let y = 0; y < CEILING; y++)
    for (let x = 2; x < w - 2; x++) {
      const course = Math.floor(y / 7);
      const across = (x + (course % 2) * 6) % 12;
      const mortar = y % 7 === 6 || across === 0;
      f.set(x, y, mortar ? 'ink' : hash(seed, x, y) % 31 === 0 ? 'stone' : 'stoneDark');
    }
  const slab: Colour[] = ['stoneDark', 'stone', 'stone', 'stoneLight'];
  for (const [i, colour] of slab.entries()) f.rect(0, CEILING + i, w, 1, colour);
  for (const [x, colour] of [
    [0, 'stoneDark'],
    [1, 'stone'],
    [w - 2, 'stone'],
    [w - 1, 'stoneDark'],
  ] as const)
    f.rect(x, 0, 1, CEILING, colour);
}

/** A small fire, two pixels across at its base, in one of two frames. */
function fire(f: Frame, x: number, y: number, n: number): void {
  f.rect(x, y, 3, 1, 'ember');
  f.rect(x, y + 1, 3, 1, 'flame');
  f.set(x + 1, y + 2, 'glow');
  f.set(x + (n === 0 ? 1 : 2), y + 3, n === 0 ? 'glow' : 'flame');
}

function crypt(f: Frame): void {
  for (const left of [5, 27]) {
    f.rect(left, 0, 14, 6, 'stone');
    f.rect(left - 1, 6, 16, 2, 'stoneLight');
  }
  f.rect(22, 15, 4, 5, 'ink');
  f.rect(23, 0, 2, 4, 'moon');
  f.set(23, 4, 'glow');
}

function store(f: Frame): void {
  for (const left of [4, 13]) {
    f.rect(left, 0, 8, 11, 'wood');
    for (const y of [2, 8]) f.rect(left, y, 8, 1, 'stoneDark');
  }
  f.rect(25, 0, 13, 10, 'wood');
  f.rect(25, 9, 13, 1, 'ember');
  for (let i = 0; i < 9; i++) f.set(26 + i, 1 + i, 'ember');
  f.rect(39, 0, 5, 6, 'moon');
  f.rect(40, 6, 3, 1, 'moon');
}

function hall(f: Frame, n: number): void {
  for (const left of [6, 40]) {
    f.rect(left, 9, 7, 13, 'red');
    f.rect(left + 2, 15, 3, 3, 'glow');
    f.rect(left - 1, 22, 9, 1, 'wood');
  }
  f.rect(14, 7, 44, 2, 'wood');
  for (const x of [17, 54]) f.rect(x, 0, 2, 7, 'wood');
  for (const left of [16, 36]) f.rect(left, 3, 18, 1, 'wood');
  // The hearth, clear of the stair a tower puts at 84 on this floor.
  f.rect(62, 0, 16, 17, 'stone');
  f.rect(61, 17, 18, 2, 'stoneLight');
  f.rect(65, 0, 10, 11, 'ink');
  fire(f, 67, 0, n);
  fire(f, 70, 0, 1 - n);
}

function barracks(f: Frame): void {
  for (const x of [3, 22]) f.rect(x, 0, 2, 18, 'wood');
  for (const y of [3, 12]) {
    f.rect(3, y, 21, 2, 'wood');
    f.rect(5, y + 2, 17, 2, 'blue');
    f.rect(5, y + 2, 4, 2, 'moon');
  }
  f.rect(29, 14, 15, 2, 'wood');
  for (const x of [31, 35, 39]) {
    f.rect(x, 0, 1, 22, 'stoneLight');
    f.set(x, 22, 'moon');
  }
}

function chapel(f: Frame, n: number): void {
  f.rect(18, 13, 12, 12, 'ink');
  f.rect(19, 13, 10, 11, 'blue');
  f.rect(23, 13, 2, 11, 'red');
  f.rect(19, 18, 10, 1, 'glow');
  f.rect(15, 0, 18, 8, 'stoneLight');
  f.rect(14, 8, 20, 1, 'moon');
  for (const x of [17, 30]) {
    f.rect(x, 9, 1, 3, 'moon');
    f.set(x, 12, x === 17 ? (n === 0 ? 'glow' : 'flame') : n === 0 ? 'flame' : 'glow');
  }
}

function watch(f: Frame, n: number): void {
  f.rect(6, 9, 28, 15, 'stone');
  f.rect(8, 11, 24, 11, 'night');
  f.rect(19, 11, 2, 11, 'stone');
  for (const [x, y] of [
    [10, 19],
    [15, 14],
    [24, 20],
    [29, 13],
  ] as const)
    f.set(x, y, 'star');
  f.rect(25, 15, 2, 2, 'moon');
  f.rect(40, 0, 2, 6, 'stoneDark');
  f.rect(37, 6, 8, 2, 'stoneDark');
  fire(f, 39, 8, n);
}

interface RoomArt {
  readonly name: string;
  /** Slots across. */
  readonly span: number;
  readonly draw: (f: Frame, n: number) => void;
  /** Two frames of flicker when it has a fire or a candle. */
  readonly frames: 1 | 2;
}

/** The rooms by id, in the order a listing shows them: from the ground up. */
export const ROOMS: Readonly<Record<string, RoomArt>> = {
  crypt: { name: 'Crypt', span: 1, draw: crypt, frames: 1 },
  store: { name: 'Store', span: 1, draw: store, frames: 1 },
  hall: { name: 'Hall', span: 2, draw: hall, frames: 2 },
  barracks: { name: 'Barracks', span: 1, draw: barracks, frames: 1 },
  chapel: { name: 'Chapel', span: 1, draw: chapel, frames: 2 },
  watch: { name: 'Watch room', span: 1, draw: watch, frames: 2 },
};

export function roomSheet(art: RoomArt): Sheet {
  const sheet = new Sheet(SLOT[0] * art.span, HEIGHT, art.frames);
  for (let n = 0; n < art.frames; n++) {
    const f = sheet.frame(n);
    shell(f, 7);
    art.draw(f, n);
  }
  return sheet;
}

/** 8 by 8: two rails and two rungs, so it tiles up a floor's height. */
export function ladderSheet(): Sheet {
  const sheet = new Sheet(8, 8, 1);
  const f = sheet.frame(0);
  for (const x of [1, 6]) f.rect(x, 0, 1, 8, 'wood');
  for (const y of [1, 5]) f.rect(2, y, 4, 1, 'wood');
  return sheet;
}
