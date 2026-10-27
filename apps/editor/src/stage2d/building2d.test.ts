/**
 * A building drawn and walked (M7.3, D85, docs/specs/rooms.md#the-stage): each room's sprite across it from
 * its bottom-left and cut at its right edge, each stair's sprite up from its floor and cut at the top, and a
 * walker sent through the building climbing the stairs its route takes and nowhere else.
 */
import type { BuildingFields } from '@eb/compiler';
import type { PackBuilding } from '@eb/core';
import type { SpriteRecord } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { type BuildingLook, buildingPieces, buildingWay } from './building2d.ts';
import { type Ground, sendTo, stepWalker, walkerOf } from './walkers.ts';

const sprite = (frame: [number, number], origin?: [number, number]): SpriteRecord => ({
  sheet: 's.png',
  frame,
  ...(origin ? { origin } : {}),
  clips: { still: { frames: [0, 0], fps: 1 } },
});
const SPRITES: Record<string, SpriteRecord> = {
  'room-hall': sprite([96, 32]),
  'room-cell': sprite([48, 32]),
  'room-narrow': sprite([40, 32]),
  ladder: sprite([8, 12]),
};
const spriteOf = (id: string) => SPRITES[id];

const FIELDS: BuildingFields = {
  slot: [48, 32],
  slots: 2,
  floors: 3,
  rooms: [
    { id: 'crypt', room: 'cell', floor: 0, slot: 0 },
    { id: 'hall', room: 'hall', floor: 1, slot: 0, span: 2 },
    { id: 'gallery', room: 'narrow', floor: 2, slot: 0, span: 2 },
    { id: 'lost', room: 'nothing', floor: 0, slot: 1 },
  ],
  stairs: [
    { floor: 0, x: 12 },
    { floor: 1, x: 84 },
  ],
  stair: 'ladder',
};
const LOOK: BuildingLook = {
  kind: 'building',
  building: FIELDS,
  sprites: { cell: 'room-cell', hall: 'room-hall', narrow: 'room-narrow' },
};

describe('a building’s pieces', () => {
  const pieces = buildingPieces(LOOK, [100, 10], spriteOf);
  const of = (id: string) => pieces.filter((p) => p.of === id).map((p) => p.box);

  it('are each room’s sprite from its bottom-left, repeated and cut at its right edge', () => {
    expect(of('crypt')).toEqual([{ x: 100, y: 10, w: 48, h: 32 }]);
    expect(of('hall')).toEqual([{ x: 100, y: 42, w: 96, h: 32 }]);
    // Two slots of a frame 40 wide: two whole frames and the left 16 columns of a third.
    expect(of('gallery')).toEqual([
      { x: 100, y: 74, w: 40, h: 32 },
      { x: 140, y: 74, w: 40, h: 32 },
      { x: 180, y: 74, w: 16, h: 32 },
    ]);
    // A room record with no sprite draws nothing.
    expect(of('lost')).toEqual([]);
  });

  it('are each stair’s sprite, its origin on the stair, repeated up a floor and cut at the top, after the rooms', () => {
    // The ladder is 8 wide with its origin at 4: 12 from the left is 8 to 15. A floor of 32 is 12, 12 and 8.
    expect(of('stair 0')).toEqual([
      { x: 108, y: 10, w: 8, h: 12 },
      { x: 108, y: 22, w: 8, h: 12 },
      { x: 108, y: 34, w: 8, h: 8 },
    ]);
    expect(of('stair 1').map((b) => [b.x, b.y])).toEqual([
      [180, 42],
      [180, 54],
      [180, 66],
    ]);
    expect(pieces.findIndex((p) => p.of.startsWith('stair'))).toBe(5);
    const { stair: _, ...unladdered } = FIELDS;
    expect(
      buildingPieces({ ...LOOK, building: unladdered }, [0, 0], spriteOf).some((p) => p.of.startsWith('stair')),
    ).toBe(false);
  });
});

const PACKED: PackBuilding = {
  object: 'tower',
  at: [100, 10],
  slot: [48, 32],
  slots: 2,
  floors: 3,
  climb: 32,
  rooms: {},
  stairs: [
    [0, 12],
    [1, 84],
  ],
  places: { top: [2, 40], low: [0, 90] },
};

describe('a walker’s way through a building', () => {
  it('is the route’s points from its own floor’s foot, up each stair it takes', () => {
    expect(buildingWay(PACKED, [190, 10], 'top', [140, 74])).toEqual({
      path: [
        [190, 10],
        [112, 10],
        [112, 42],
        [184, 42],
        [184, 74],
        [140, 74],
      ],
      route: [
        [0, 90],
        [0, 12],
        [1, 12],
        [1, 84],
        [2, 84],
        [2, 40],
      ],
    });
  });

  it('is straight off the building, and none to a floor no stair reaches', () => {
    expect(buildingWay(PACKED, [20, 10], 'top', [140, 74])).toBeUndefined();
    expect(buildingWay(PACKED, [190, 10], 'away', [400, 10])).toBeUndefined();
    expect(buildingWay({ ...PACKED, stairs: [[0, 12]] }, [190, 10], 'top', [140, 74])).toBeNull();
  });

  it('climbs back down first from halfway up a ladder', () => {
    expect(buildingWay(PACKED, [112, 30], 'low', [190, 10])?.path).toEqual([
      [112, 10],
      [190, 10],
    ]);
  });
});

describe('a walker sent through a building', () => {
  const places = new Map([
    ['top', [140, 74] as const],
    ['low', [190, 10] as const],
    ['away', [400, 10] as const],
  ]);
  const ground: Ground = { building: PACKED };

  it('walks along its floor and climbs only at the stairs, arriving at the mark', () => {
    const walker = walkerOf('warden', [190, 10], 30, undefined);
    sendTo(walker, { goal: 'top' }, places, ground);
    expect(walker.floors?.length).toBe(6);
    const seen: (readonly [number, number])[] = [];
    let arrived: string | undefined;
    for (let i = 0; i < 400 && !arrived; i++) {
      arrived = stepWalker(walker, 0.1);
      seen.push(walker.at);
    }
    expect(arrived).toBe('top');
    expect(walker.at).toEqual([140, 74]);
    // Off a floor's foot only on a ladder: x is 112 or 184 whenever y is between floors.
    for (const [x, y] of seen) if (![10, 42, 74].includes(y)) expect([112, 184]).toContain(x);
  });

  it('stays when no stair reaches the mark, and walks straight off the building', () => {
    const cut = walkerOf('warden', [190, 10], 30, undefined);
    sendTo(cut, { goal: 'top' }, places, { building: { ...PACKED, stairs: [] } });
    expect(cut.target).toBeUndefined();
    expect(stepWalker(cut, 1)).toBeUndefined();
    const out = walkerOf('warden', [190, 10], 30, undefined);
    sendTo(out, { goal: 'away' }, places, ground);
    expect(out.path).toEqual([]);
    expect(out.floors).toBeUndefined();
    expect(out.target).toEqual([400, 10]);
  });
});
