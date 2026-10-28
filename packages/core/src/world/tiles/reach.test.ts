/**
 * A battle's doors and a unit's reach (M7.5, D87, docs/specs/tactics.md#the-rules-in-the-engine), held to
 * space-wrecked's tests/moves.test.js case by case on rooms made a tile and an edge at a time.
 */
import { describe, expect, it } from 'vitest';
import { room } from '../../../test/tileMaps.ts';
import { coverFrom } from './cover.ts';
import { FULL_COVER, gridOf, HALF_COVER, type Tile } from './grid.ts';
import { edgeKey, type Holder, reach, sideToward, stepsFrom, withEdges } from './reach.ts';
import { lineOfSight } from './sight.ts';

const at = (spots: Map<string, { cost: number; path: readonly Tile[] }>, c: number, r: number) =>
  spots.get(`${c},${r}`);
const none = new Map<string, Holder>();

describe('reach', () => {
  it('finds a diamond of tiles in an open room, four-way, its own tile at 0', () => {
    const spots = reach(gridOf(room(9, 9).tiles()), [4, 4], 2, none);
    expect(spots.size).toBe(13);
    expect(at(spots, 6, 4)?.cost).toBe(2);
    expect(at(spots, 5, 5)?.cost).toBe(2);
    expect(at(spots, 6, 5)).toBeUndefined();
    expect(spots.get('4,4')).toEqual({ tile: [4, 4], cost: 0, path: [[4, 4]] });
  });

  it('ties paths of equal cost the same way, east before south, and lists tiles as first found', () => {
    const spots = reach(gridOf(room(3, 3).tiles()), [0, 0], 2, none);
    expect(at(spots, 1, 1)?.path).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect([...spots.keys()]).toEqual(['0,0', '1,0', '0,1', '2,0', '1,1', '0,2']);
  });

  it('is stopped by a wall, the hull and a hatch; a door it walks through', () => {
    for (const [kind, passes] of [
      ['wall', false],
      ['hull', false],
      ['hatch', false],
      ['door', true],
    ] as const) {
      const grid = gridOf(room(3, 1).wall(0, 0, 'e', kind).tiles());
      expect(at(reach(grid, [0, 0], 5, none), 1, 0) !== undefined, kind).toBe(passes);
    }
  });

  it('walks round a wall, and stands only where a tile is walked on', () => {
    expect(at(reach(gridOf(room(3, 3).wall(0, 1, 'e').tiles()), [0, 1], 9, none), 1, 1)?.cost).toBe(3);
    const crate = gridOf(room(2, 1).put(1, 0, HALF_COVER).tiles());
    expect(at(reach(crate, [0, 0], 3, none), 1, 0)).toBeUndefined();
  });

  it("passes its own side but not the other's, and stops on neither", () => {
    const corridor = gridOf(room(4, 1).tiles());
    const ally = reach(corridor, [0, 0], 9, new Map([['1,0', 'ally']]));
    expect(at(ally, 1, 0)).toBeUndefined();
    expect(at(ally, 2, 0)?.cost).toBe(2);
    expect(at(reach(corridor, [0, 0], 9, new Map([['1,0', 'foe']])), 2, 0)).toBeUndefined();
  });

  it('stops at its budget', () => {
    const spots = reach(gridOf(room(9, 1).tiles()), [0, 0], 4, none);
    expect([...spots.values()].map((s) => s.cost)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("a battle's doors", () => {
  const doorway = room(3, 1).wall(0, 0, 'e', 'door').tiles();

  it('keys an edge the same from either tile', () => {
    expect(edgeKey([0, 0], 'e')).toBe(edgeKey([1, 0], 'w'));
    expect(edgeKey([2, 3], 's')).toBe(edgeKey([2, 4], 'n'));
    expect(edgeKey([2, 3], 'n')).toBe('2,3,n');
  });

  it('lets sight and cover through an open door, and makes a welded one a wall that stops walking', () => {
    const grid = gridOf(doorway);
    expect(lineOfSight(grid, [0, 0], [2, 0])).toBe(false);
    expect(coverFrom(grid, [1, 0], [0, 0])).toBe('full');
    const open = withEdges(grid, [edgeKey([0, 0], 'e')], []);
    expect(lineOfSight(open, [0, 0], [2, 0])).toBe(true);
    expect(coverFrom(open, [1, 0], [0, 0])).toBe('none');
    const welded = withEdges(grid, [], ['1,0,w']);
    expect(welded.edge(0, 0, 'e')).toBe('wall');
    expect(at(reach(welded, [0, 0], 5, none), 1, 0)).toBeUndefined();
    expect(at(reach(grid, [0, 0], 5, none), 1, 0)?.cost).toBe(1);
    expect(withEdges(grid, [], [])).toBe(grid);
  });

  it('leaves every other edge as it was', () => {
    const grid = gridOf(room(3, 2).wall(0, 0, 'e', 'door').wall(0, 1, 'e').put(2, 1, FULL_COVER).tiles());
    const laid = withEdges(grid, ['1,0,w'], ['9,9,n']);
    expect(laid.edge(0, 1, 'e')).toBe('wall');
    expect(laid.rule(2, 1)).toBe(FULL_COVER);
    expect(laid.edge(0, 0, 'e')).toBeNull();
  });
});

describe('stepsFrom', () => {
  it('counts steps from the nearest source, through doors, round walls', () => {
    const grid = gridOf(room(5, 2).wall(1, 0, 'e', 'door').wall(1, 1, 'e').tiles());
    const away = stepsFrom(grid, [
      [0, 0],
      [4, 1],
    ]);
    expect(away.get('2,0')).toBe(2);
    expect(away.get('3,0')).toBe(2);
    expect(away.get('2,1')).toBe(2);
    expect(away.get('0,1')).toBe(1);
    const shut = stepsFrom(withEdges(grid, [], ['2,0,w']), [[0, 0]]);
    expect(shut.has('2,0')).toBe(false);
  });
});

it('sideToward names the side a step goes through', () => {
  expect(
    (
      [
        [1, 0],
        [2, 1],
        [1, 2],
        [0, 1],
      ] as const
    ).map((to) => sideToward([1, 1], to)),
  ).toEqual(['n', 'e', 's', 'w']);
});
