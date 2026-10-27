/**
 * The engine's tileset type (M7.2, D84, docs/specs/tilemaps.md#a-tileset): a PNG sheet cut into tiles
 * of one size, numbered across and then down from 0; each tile's character, frame and rules (walk,
 * cover, blocks sight, joins); and the frames an edge is drawn with. The legend a tilemap's rows are
 * read through is the tiles' characters (legendOf): a map's keys are names, and a legend's are `.` and `#`. The rules a
 * type file can't say are E092's here; the compiler reads the sheet's header for the rest
 * (tilesets.ts in @eb/compiler).
 */
import { pointerSegment } from '@eb/core';
import type { Report } from './checkValue.ts';
import type { FieldDef, TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

export const TILESET = 'tileset';

/** The frames a tile that joins has: one for each of its four neighbours joined or not. */
export const JOIN_FRAMES = 16;

export type TileCover = 'half' | 'full';

export interface TilesetTile {
  /** The one character it is written as in a tilemap's rows. */
  readonly char: string;
  readonly frame: number;
  readonly walk?: boolean;
  readonly cover?: TileCover;
  readonly blocksSight?: boolean;
  readonly joins?: boolean;
}

/** An edge kind's frames: between a tile and the one above or below (across), and beside it (down). */
export interface EdgeFrames {
  readonly across: number;
  readonly down: number;
}

export interface TilesetEdges {
  readonly wall?: EdgeFrames;
  readonly hull?: EdgeFrames;
  readonly door?: EdgeFrames;
  readonly hatch?: EdgeFrames;
  readonly post?: number;
}

/** A tileset record as its file holds it. */
export interface TilesetRecord {
  readonly name?: string;
  readonly sheet: string;
  readonly tile: readonly [number, number];
  readonly tiles: Readonly<Record<string, TilesetTile>>;
  readonly edges?: TilesetEdges;
}

const frame = (label: string, description?: string, optional = false): FieldDef => ({
  kind: 'int',
  min: 0,
  optional,
  label,
  ...(description !== undefined ? { description } : {}),
});

const edgeKind = (label: string): FieldDef => ({
  kind: 'group',
  optional: true,
  label,
  fields: {
    across: frame('Across', 'Its frame between a tile and the one above or below it'),
    down: frame('Down', 'Its frame between a tile and the one beside it'),
  },
});

export const TILESET_TYPE_FILE: TypeFile = {
  title: 'Tileset',
  description:
    'Tiles for a 2D space’s tilemaps: a PNG sheet cut into tiles, their rules and characters (docs/specs/tilemaps.md).',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    sheet: { kind: 'asset', of: 'image', label: 'Sheet', description: 'A .png under assets/, its tiles side by side' },
    tile: {
      kind: 'list',
      of: { kind: 'int', min: 1 },
      min: 2,
      max: 2,
      label: 'Tile',
      description: 'Each tile’s width and height in pixels',
    },
    tiles: {
      kind: 'map',
      label: 'Tiles',
      description: 'Each tile’s character, frame and what it does',
      of: {
        kind: 'group',
        fields: {
          char: {
            kind: 'text',
            min: 1,
            label: 'Character',
            description: 'The one character it is written as in a tilemap’s rows, never a space',
          },
          frame: frame('Frame', 'Counted across and then down from 0'),
          walk: { kind: 'bool', optional: true, label: 'Walk', description: 'A walker can stand on it' },
          cover: {
            kind: 'enum',
            values: ['half', 'full'],
            optional: true,
            label: 'Cover',
            description: 'What it gives whoever stands beside it: none when left out',
          },
          blocksSight: { kind: 'bool', optional: true, label: 'Blocks sight' },
          joins: {
            kind: 'bool',
            optional: true,
            label: 'Joins',
            description: 'It has 16 frames from its first, one for each way its neighbours join it',
          },
        },
      },
    },
    edges: {
      kind: 'group',
      optional: true,
      label: 'Edges',
      description: 'The frames walls, the hull, doors and hatches are drawn with on the edges between tiles',
      fields: {
        wall: edgeKind('Wall'),
        hull: edgeKind('Hull'),
        door: edgeKind('Door'),
        hatch: edgeKind('Hatch'),
        post: frame('Post', 'Drawn where edges meet', true),
      },
    },
  },
};

export const TILESET_DATA: DataType = typeFromFile(TILESET, TILESET_TYPE_FILE);

/** The last frame a tile draws with: its 16 joins' last when it joins. */
export const lastFrameOf = (tile: TilesetTile): number => tile.frame + (tile.joins === true ? JOIN_FRAMES - 1 : 0);

/** The tile each character is written as, the first tile in the file's order where two share one. */
export function legendOf(tileset: Pick<TilesetRecord, 'tiles'>): ReadonlyMap<string, string> {
  const legend = new Map<string, string>();
  for (const [id, tile] of Object.entries(tileset.tiles)) if (!legend.has(tile.char)) legend.set(tile.char, id);
  return legend;
}

/** A tileset record that passed its schema: a tile at least, each written as its own one character (E092). */
export function checkTileset(record: TilesetRecord, report: Report): void {
  if (Object.keys(record.tiles).length === 0) report('E092', '/tiles', 'A tileset has at least one tile');
  const legend = legendOf(record);
  for (const [id, tile] of Object.entries(record.tiles)) {
    const at = `/tiles/${pointerSegment(id)}/char`;
    if ([...tile.char].length !== 1) report('E092', at, `“${tile.char}” isn’t one character: a tile is written as one`);
    else if (tile.char.trim() === '') report('E092', at, 'A space is no tile: a tile can’t be written as one');
    else if (legend.get(tile.char) !== id)
      report('E092', at, `“${legend.get(tile.char)}” is written as “${tile.char}” already`);
  }
}
