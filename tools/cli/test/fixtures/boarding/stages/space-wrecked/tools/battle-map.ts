// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Prints a ship's battle map (src/sim/mapFromShip.js) as text: tiles, the
// walls between them, doorways and hatches, and the wrecked rooms' hazards;
// and reads one back from text. The command line that ran these on a ship
// stays behind: a stage reads no files.
import { regions } from '../sim/gen/site.ts';
import { cellAt, createGrid, type Side } from '../sim/grid.ts';
import { type BattleMap, wallAt } from '../sim/map-from-ship.ts';
import { readMapText } from '../sim/map-text.ts';

// Edges, by what stands there: [on a north edge, on a west edge].
const EDGES: Record<string, [string, string]> = { wall: ['-', '|'], hull: ['=', 'I'], door: ['/', '/'], hatch: ['o', 'o'] };
const HAZARDS: Record<string, string> = { fire: 'F', vacuum: 'V', rubble: 'R' };
const SIDES: Side[] = ['n', 'e', 's', 'w'];

// The map as text, two characters a tile each way: tiles at odd places,
// edges between them and '+' where edges meet. A tile is its character in
// the tiles legend (data/modules.json), ' ' for space and '%' for hull. A
// second block shows hazards when a room is wrecked: F fire, V vacuum,
// R rubble, '.' for a room tile without one.
export function renderMap(map: BattleMap, legend: Record<string, string>): string {
  const chars: Record<string, string> = { space: ' ', hull: '%', ...Object.fromEntries(Object.entries(legend).map(([char, name]) => [name, char])) };
  const lines: string[] = [];
  for (let y = 0; y <= map.height; y++) {
    let edges = '';
    let tiles = '';
    for (let x = 0; x <= map.width; x++) {
      const meets = [wallAt(map, x - 1, y, 'n'), wallAt(map, x, y, 'n'), wallAt(map, x, y - 1, 'w'), wallAt(map, x, y, 'w')];
      edges += meets.some(Boolean) ? '+' : ' ';
      if (x < map.width) edges += EDGES[wallAt(map, x, y, 'n') ?? '']?.[0] ?? ' ';
      if (y < map.height) {
        tiles += EDGES[wallAt(map, x, y, 'w') ?? '']?.[1] ?? ' ';
        if (x < map.width) tiles += chars[cellAt(map.tiles, x, y) as string] ?? '?';
      }
    }
    lines.push(edges.trimEnd());
    if (y < map.height) lines.push(tiles.trimEnd());
  }
  if (map.hazards.cells.some(Boolean)) {
    lines.push('');
    for (let y = 0; y < map.height; y++) {
      let row = '';
      for (let x = 0; x < map.width; x++) {
        const hazard = cellAt(map.hazards, x, y);
        row += hazard ? HAZARDS[hazard] : cellAt(map.roomAt, x, y) === null ? ' ' : '.';
      }
      lines.push(row.trimEnd());
    }
  }
  return `${lines.join('\n')}\n`;
}

// A map from text in renderMap's format (src/sim/mapText.js), so tests can
// draw their own: tiles and edges only. The text starts with the first row
// of edges and ends with the last, and a final newline is ignored. Each
// area the walls close off is a room of its own (site.js regions), so its
// floor takes its own tint; nothing is wrecked, and each hatch opens from
// its room's side. Trailing spaces can be left off, so give the width when
// the last column is bare space.
export function parseMap(text: string, legend: Record<string, string>, { width }: { width?: number } = {}): BattleMap {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  let read: ReturnType<typeof readMapText>;
  try {
    read = readMapText(lines, { width });
  } catch (err) {
    throw new Error((err as Error).message.replace('readMapText', 'parseMap'));
  }
  const { height, chars, walls } = read;
  width = read.width;
  const names: Record<string, string> = { ' ': 'space', '%': 'hull', ...legend };
  const tiles = createGrid(width, height, 'space');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      const char = chars.cells[k] as string;
      if (!(char in names)) throw new Error(`parseMap: no tile for "${char}" at (${x}, ${y})`);
      tiles.cells[k] = names[char] as string;
    }
  }
  const roomAt = regions(tiles, walls);
  const hazards = createGrid(width, height, null);
  const map: BattleMap = { width, height, tilesPerCell: 1, origin: [0, 0], tiles, roomAt, hazards, walls, rooms: [], hatches: [] };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const side of SIDES) {
        const uid = cellAt(roomAt, x, y) ?? null;
        if (wallAt(map, x, y, side) === 'hatch' && uid !== null) map.hatches.push({ uid, x, y, side });
      }
    }
  }
  return map;
}
