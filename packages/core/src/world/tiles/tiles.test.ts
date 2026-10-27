/**
 * A tilemap's rules in the pure core (M7.2, D84, docs/specs/tilemaps.md): map text read and written back,
 * the grid, sight, cover and routes, on Space-Wrecked's example ship (its tests/golden/example-ship.map.txt,
 * RCJLabs' own, D62) and on small maps made to show one rule each.
 */
import { describe, expect, it } from 'vitest';
import { packed, SHIP } from '../../../test/tileMaps.ts';
import { coverFrom } from './cover.ts';
import { BLOCKS_SIGHT, FULL_COVER, gridOf, HALF_COVER, SIDES, step, type Tile, WALK } from './grid.ts';
import { edgesText, isMapText, mapTextSize, mapTextTiles, readEdges, trimLines } from './mapText.ts';
import { canStep, route } from './route.ts';
import { lineOfSight } from './sight.ts';

const ship = () =>
  packed(
    mapTextTiles(SHIP).map((row) => row.padEnd(11, ' ')),
    SHIP,
  );

describe('map text', () => {
  it('is told from plain rows, its tiles read one a place, its size half its lines', () => {
    expect(isMapText(SHIP)).toBe(true);
    expect(isMapText(['..#..', '.....', '..G..'])).toBe(false);
    expect(mapTextSize(SHIP)).toEqual([11, 5]);
    expect(mapTextTiles(SHIP)).toEqual(['   hh....', ' #.....#..c', ' #.........', ' #.H.aac%.c', ' #.']);
    expect(trimLines('\n\n  +-+\n  |.|\n  +-+\n\n')).toEqual(['  +-+', '  |.|', '  +-+']);
  });

  it('writes its edges back whole, every line full width, a corner where an edge meets', () => {
    const edges = readEdges(SHIP, 11, 5);
    const text = edgesText(edges, 11, 5);
    expect(text).toHaveLength(11);
    expect(text.every((line) => line.length === 23)).toBe(true);
    // The tiles' places blank, the rest as Space-Wrecked printed it, padded.
    const blanked = SHIP.map((line, i) =>
      [...line.padEnd(23, ' ')].map((ch, j) => (i % 2 === 1 && j % 2 === 1 ? ' ' : ch)).join(''),
    );
    expect(text).toEqual(blanked);
    expect(readEdges(text, 11, 5)).toEqual(edges);
  });
});

describe('the grid', () => {
  it('reads each cell its rules and each tile its edges, one edge seen from both sides', () => {
    const grid = gridOf(ship());
    expect(grid.rule(3, 0)).toBe(HALF_COVER);
    expect(grid.rule(2, 1)).toBe(WALK);
    expect(grid.rule(8, 3)).toBe(FULL_COVER | BLOCKS_SIGHT);
    expect(grid.rule(-1, 0)).toBe(0);
    expect(grid.edge(3, 0, 'w')).toBe('hull');
    expect(grid.edge(2, 1, 'e')).toBe('door');
    expect(grid.edge(5, 3, 's')).toBe('hatch');
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 10; c++) {
        expect(grid.edge(c, r, 'e')).toBe(grid.edge(c + 1, r, 'w'));
        if (r < 4) expect(grid.edge(c, r, 's')).toBe(grid.edge(c, r + 1, 'n'));
      }
  });
});

describe('sight', () => {
  it('is the same from either end, over every pair of the ship’s tiles', () => {
    const grid = gridOf(ship());
    const tiles: Tile[] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 11; c++) tiles.push([c, r]);
    let seen = 0;
    for (const a of tiles)
      for (const b of tiles) {
        expect(lineOfSight(grid, a, b)).toBe(lineOfSight(grid, b, a));
        if (lineOfSight(grid, a, b)) seen++;
      }
    // Some see each other, and walls hide the rest.
    expect(seen).toBeGreaterThan(tiles.length);
    expect(seen).toBeLessThan(tiles.length * tiles.length);
  });

  it('is blocked by any edge it crosses, a door too', () => {
    const open = gridOf(packed(['..'], ['', '']));
    expect(lineOfSight(open, [0, 0], [1, 0])).toBe(true);
    for (const edge of ['|', 'I', '/', 'o'])
      expect(lineOfSight(gridOf(packed(['..'], ['', ` .${edge}.`])), [0, 0], [1, 0])).toBe(false);
    // And on the edges between rows: a north or south side.
    expect(lineOfSight(gridOf(packed(['.', '.'], [])), [0, 0], [0, 1])).toBe(true);
    for (const edge of ['-', '=', '/', 'o'])
      expect(lineOfSight(gridOf(packed(['.', '.'], ['', '', ` ${edge}`])), [0, 1], [0, 0])).toBe(false);
  });

  it('is blocked by a tile that blocks sight on the way, never by its two ends', () => {
    const grid = gridOf(packed(['.#.', '#.#'], []));
    expect(lineOfSight(grid, [0, 0], [2, 0])).toBe(false);
    expect(lineOfSight(grid, [1, 0], [0, 1])).toBe(true);
  });

  it('gets round a corner it runs exactly through when either way is clear', () => {
    expect(lineOfSight(gridOf(packed(['.#.', '...', '...'], [])), [0, 0], [2, 2])).toBe(true);
    expect(lineOfSight(gridOf(packed(['.#.', '#..', '...'], [])), [0, 0], [1, 1])).toBe(false);
    expect(lineOfSight(gridOf(packed(['...', '.#.', '...'], [])), [0, 0], [2, 2])).toBe(false);
  });
});

describe('cover', () => {
  it('counts the sides facing the attacker: full from an edge, else the tile beyond’s, flanked with none', () => {
    const grid = gridOf(packed(['.c.', '...', '...'], []));
    expect(coverFrom(grid, [1, 1], [0, 0])).toBe('half');
    expect(coverFrom(grid, [1, 1], [1, 2])).toBe('none');
    expect(coverFrom(grid, [1, 1], [2, 2])).toBe('none');
    // From due east, on the same row, the crate to the north faces nobody.
    expect(coverFrom(grid, [1, 1], [2, 1])).toBe('none');
    const walled = gridOf(packed(['.c.', '...', '...'], ['', '', '', '  |']));
    expect(coverFrom(walled, [1, 1], [0, 2])).toBe('full');
    expect(coverFrom(gridOf(packed(['.H.', '...'], [])), [1, 1], [1, 0])).toBe('full');
  });
});

describe('routes', () => {
  it('step four ways across open edges and doors, never a wall, the hull or a hatch', () => {
    const grid = gridOf(ship());
    const walkable: Tile[] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 11; c++) if (grid.rule(c, r) & WALK) walkable.push([c, r]);
    let reached = 0;
    let doors = 0;
    for (const to of walkable) {
      const tiles = route(grid, [5, 3], to);
      if (!tiles) continue;
      reached++;
      expect(tiles[0]).toEqual([5, 3]);
      expect(tiles.at(-1)).toEqual(to);
      for (let i = 1; i < tiles.length; i++) {
        const side = SIDES.find((s) => step(tiles[i - 1] as Tile, s).join() === (tiles[i] as Tile).join());
        expect(side).toBeDefined();
        expect(canStep(grid, tiles[i - 1] as Tile, side as (typeof SIDES)[number])).toBe(true);
        if (grid.edge(...(tiles[i - 1] as Tile), side as (typeof SIDES)[number]) === 'door') doors++;
      }
    }
    // From the airlock most of the ship's floor is reached, through its doors; the engine room's two
    // tiles behind its machinery are not.
    expect(reached).toBe(walkable.length - 2);
    expect(doors).toBeGreaterThan(0);
    expect(route(grid, [5, 3], [2, 4])).toBeNull();
    expect(route(grid, [5, 3], [9, 1])?.length).toBeGreaterThan(5);
    const hatched = gridOf(packed(['.', '.'], ['', '', ' o']));
    expect(route(hatched, [0, 0], [0, 1])).toBeNull();
    for (const edge of ['|', 'I']) expect(route(gridOf(packed(['..'], ['', ` .${edge}.`])), [0, 0], [1, 0])).toBeNull();
    expect(route(gridOf(packed(['..'], ['', ' ./.'])), [0, 0], [1, 0])).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('tie the same way every time, trying north, east, south, west', () => {
    const grid = gridOf(packed(['..', '..'], []));
    expect(route(grid, [0, 1], [1, 0])).toEqual([
      [0, 1],
      [0, 0],
      [1, 0],
    ]);
    expect(route(grid, [1, 0], [0, 1])).toEqual([
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it('are none to a tile nobody stands on or off the map, and one tile to where it stands', () => {
    const grid = gridOf(packed(['.c.'], []));
    expect(route(grid, [0, 0], [1, 0])).toBeNull();
    expect(route(grid, [0, 0], [2, 0])).toBeNull();
    expect(route(grid, [0, 0], [5, 0])).toBeNull();
    expect(route(grid, [0, 0], [0, 0])).toEqual([[0, 0]]);
    expect(route(grid, [1, 0], [1, 0])).toBeNull();
    // A walker standing on what it can't stand on may still step off it.
    expect(route(grid, [1, 0], [2, 0])).toEqual([
      [1, 0],
      [2, 0],
    ]);
  });
});
