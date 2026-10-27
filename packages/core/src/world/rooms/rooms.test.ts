/**
 * A building's places, rooms and routes (M7.3, D85, docs/specs/rooms.md): where a point stands, which room
 * a place is in, and the cheapest way along floors and through stairs, the same every time, checked against
 * an oracle that relaxes every edge until nothing changes.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TOWER } from '../../../test/towers.ts';
import { type FloorPlace, floorPlaceOf, type PackBuilding, pointOf, roomAt, widthOf } from './building.ts';
import { buildingRoute, routeCost } from './route.ts';

describe('a place in a building', () => {
  it('is the floor whose band the feet are in, at their x from the building’s left', () => {
    expect(widthOf(TOWER)).toBe(96);
    expect(floorPlaceOf(TOWER, [32, 8])).toEqual([0, 0]);
    expect(floorPlaceOf(TOWER, [82.5, 31.9])).toEqual([0, 50]);
    expect(floorPlaceOf(TOWER, [82, 32])).toEqual([1, 50]);
    expect(floorPlaceOf(TOWER, [127, 103])).toEqual([3, 95]);
    // Left of it, past its right edge, under its ground and above its top floor: off it.
    for (const point of [
      [31, 8],
      [128, 8],
      [40, 7],
      [40, 104],
    ] as const)
      expect(floorPlaceOf(TOWER, point)).toBeUndefined();
  });

  it('stands at its floor’s foot', () => {
    expect(pointOf(TOWER, [2, 70])).toEqual([102, 56]);
    expect(floorPlaceOf(TOWER, pointOf(TOWER, [2, 70]))).toEqual([2, 70]);
  });

  it('is in the room on its slot, a room spanning slots in each, or none on a bare slot', () => {
    expect(roomAt(TOWER, [0, 47])).toBe('crypt');
    expect(roomAt(TOWER, [0, 48])).toBe('store');
    expect(roomAt(TOWER, [1, 0])).toBe('hall');
    expect(roomAt(TOWER, [1, 95])).toBe('hall');
    expect(roomAt(TOWER, [2, 60])).toBe('chapel');
    const bare = { ...TOWER, rooms: { hall: [1, 0, 1] as const } };
    expect(roomAt(bare, [1, 60])).toBe('');
    expect(roomAt(bare, [0, 10])).toBe('');
  });
});

describe('a route through a building', () => {
  it('walks along a floor when the goal is on it', () => {
    expect(buildingRoute(TOWER, [0, 5], [0, 90])).toEqual([
      [0, 5],
      [0, 90],
    ]);
    expect(buildingRoute(TOWER, [2, 30], [2, 30])).toEqual([[2, 30]]);
  });

  it('climbs each stair on the way up, and the same ones down', () => {
    const up = buildingRoute(TOWER, [0, 5], [3, 50]);
    expect(up).toEqual([
      [0, 5],
      [0, 12],
      [1, 12],
      [1, 84],
      [2, 84],
      [2, 12],
      [3, 12],
      [3, 50],
    ]);
    expect(buildingRoute(TOWER, [3, 50], [0, 5])).toEqual([...(up as FloorPlace[])].reverse());
    expect(routeCost(TOWER, up as FloorPlace[])).toBe(7 + 72 + 72 + 38 + 3 * 24);
  });

  it('leaves out a place the same as the one before, as a start at a stair', () => {
    expect(buildingRoute(TOWER, [0, 12], [1, 50])).toEqual([
      [0, 12],
      [1, 12],
      [1, 50],
    ]);
  });

  it('takes the cheaper of two stairs, and the one listed first when they cost the same', () => {
    const two: PackBuilding = {
      ...TOWER,
      floors: 2,
      stairs: [
        [0, 10],
        [0, 80],
      ],
    };
    expect(buildingRoute(two, [0, 70], [1, 90])?.[1]).toEqual([0, 80]);
    expect(buildingRoute(two, [0, 20], [1, 0])?.[1]).toEqual([0, 10]);
    // From 45 both cost 35 walking and a climb: the first listed wins, whichever it is.
    expect(buildingRoute(two, [0, 45], [1, 45])?.[1]).toEqual([0, 10]);
    expect(
      buildingRoute(
        {
          ...two,
          stairs: [
            [0, 80],
            [0, 10],
          ],
        },
        [0, 45],
        [1, 45],
      )?.[1],
    ).toEqual([0, 80]);
  });

  it('weighs a climb at the building’s cost', () => {
    // However steep: 10 along, the climb, 10 back.
    const steep: PackBuilding = { ...TOWER, floors: 2, climb: 1000, stairs: [[0, 10]] };
    expect(routeCost(steep, buildingRoute(steep, [0, 0], [1, 0]) as FloorPlace[])).toBe(1020);
  });

  it('is none to a floor no stair reaches, or off the building', () => {
    const cut: PackBuilding = { ...TOWER, stairs: [[0, 12]] };
    expect(buildingRoute(cut, [0, 5], [2, 50])).toBeNull();
    expect(buildingRoute(cut, [2, 50], [0, 5])).toBeNull();
    expect(buildingRoute(TOWER, [0, 5], [4, 5])).toBeNull();
    // Not even by a stair that climbs from the top floor, which the pack refuses anyway.
    expect(buildingRoute({ ...TOWER, stairs: [...TOWER.stairs, [3, 50]] }, [3, 50], [4, 50])).toBeNull();
    expect(buildingRoute(TOWER, [-1, 5], [0, 5])).toBeNull();
  });
});

/** The cheapest cost between two places by relaxing every edge until nothing changes, or -1. */
function oracle(building: PackBuilding, from: FloorPlace, to: FloorPlace): number {
  const points: FloorPlace[] = [
    from,
    to,
    ...building.stairs.flatMap(([f, x]): FloorPlace[] => [
      [f, x],
      [f + 1, x],
    ]),
  ];
  const cost = points.map((_, i): number => (i === 0 ? 0 : -1));
  for (let changed = true; changed; ) {
    changed = false;
    points.forEach(([f, x], i) => {
      if (cost[i] === -1) return;
      points.forEach(([g, y], j) => {
        const stair = i >= 2 && j >= 2 && i !== j && (i - 2) >> 1 === (j - 2) >> 1;
        const step = stair ? building.climb : f === g ? Math.abs(x - y) : -1;
        const total = (cost[i] as number) + step;
        if (step !== -1 && (cost[j] === -1 || total < (cost[j] as number))) {
          cost[j] = total;
          changed = true;
        }
      });
    });
  }
  return cost[1] as number;
}

const buildings = fc
  .record({
    floors: fc.integer({ min: 1, max: 6 }),
    slots: fc.integer({ min: 1, max: 4 }),
    climb: fc.integer({ min: 1, max: 60 }),
  })
  .chain(({ floors, slots, climb }) =>
    fc.record({
      building: fc.constant({ ...TOWER, floors, slots, climb }),
      stairs: fc.array(
        fc.tuple(fc.integer({ min: 0, max: Math.max(0, floors - 2) }), fc.integer({ min: 0, max: slots * 48 - 1 })),
        {
          maxLength: floors > 1 ? 8 : 0,
        },
      ),
      from: fc.tuple(fc.integer({ min: 0, max: floors - 1 }), fc.integer({ min: 0, max: slots * 48 - 1 })),
      to: fc.tuple(fc.integer({ min: 0, max: floors - 1 }), fc.integer({ min: 0, max: slots * 48 - 1 })),
    }),
  );

describe('every route', () => {
  it('is the cheapest there is, steps along a floor or up and down a stair, and is the same every time', () => {
    fc.assert(
      fc.property(buildings, ({ building: base, stairs, from, to }) => {
        const building = { ...base, stairs };
        const route = buildingRoute(building, from, to);
        const best = oracle(building, from, to);
        if (route === null) return best === -1;
        expect(routeCost(building, route)).toBe(best);
        expect(route[0]).toEqual(from);
        expect(route[route.length - 1]).toEqual(to);
        for (let i = 1; i < route.length; i++) {
          const [[f0, x0], [f1, x1]] = [route[i - 1] as FloorPlace, route[i] as FloorPlace];
          const climbed = stairs.some(
            ([f, x]) => x === x0 && x === x1 && Math.min(f0, f1) === f && Math.abs(f1 - f0) === 1,
          );
          expect(f0 === f1 || climbed).toBe(true);
        }
        expect(buildingRoute(building, from, to)).toEqual(route);
        return true;
      }),
      { numRuns: 500 },
    );
  });
});
