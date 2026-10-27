/**
 * Each tileset record's sheet, read only as far as its PNG header (M7.2, D84,
 * docs/specs/tilemaps.md#a-tileset): E092 for a sheet that isn't a PNG, one that isn't a whole
 * number of tiles across and down, and a tile's frame, its 16 joins, an edge's frame or the post
 * past the sheet's last tile. The record's own rules are checked with it (tilesetTypes.ts in
 * @eb/schema), as a sprite's are; the editor runs the same check after its record index.
 */
import { pointerSegment } from '@eb/core';
import {
  type Diagnostic,
  JOIN_FRAMES,
  lastFrameOf,
  type RecordInput,
  severityOf,
  TILESET,
  type TilesetRecord,
} from '@eb/schema';
import type { ProjectSource } from './source.ts';
import { framesOf, sheetReader, spriteSheetOf } from './sprites.ts';
import type { PngHeader } from './terrains.ts';
import { tilesetIn } from './tilemaps.ts';

const EDGE_KINDS = ['wall', 'hull', 'door', 'hatch'] as const;

/** Each frame the tileset draws with: the path that names it, the last frame it needs, and whether it joins. */
function framesUsed(tileset: TilesetRecord): [string, number, boolean][] {
  const used: [string, number, boolean][] = Object.entries(tileset.tiles).map(([id, tile]) => [
    `/tiles/${pointerSegment(id)}/frame`,
    lastFrameOf(tile),
    tile.joins === true,
  ]);
  for (const kind of EDGE_KINDS) {
    const frames = tileset.edges?.[kind];
    if (frames) used.push([`/edges/${kind}/across`, frames.across, false], [`/edges/${kind}/down`, frames.down, false]);
  }
  if (tileset.edges?.post !== undefined) used.push(['/edges/post', tileset.edges.post, false]);
  return used;
}

/** E092 for one tileset record, given its sheet's header: null when it isn't a PNG. */
export function tilesetDiagnostics(record: RecordInput, header: PngHeader | null): Diagnostic[] {
  const at = (path: string, message: string): Diagnostic => ({
    code: 'E092',
    severity: severityOf('E092'),
    message,
    type: record.type,
    id: record.id,
    ...(record.file !== undefined ? { file: record.file } : {}),
    path,
  });
  if (header === null) return [at('/sheet', 'It isn’t a PNG: a sheet is read as one')];
  const tileset = tilesetIn(record.value);
  if (!tileset) return [];
  const count = framesOf(header, tileset.tile);
  if (typeof count === 'string') return [at('/tile', count.replace('frames', 'tiles'))];
  const found: Diagnostic[] = [];
  for (const [path, last, joins] of framesUsed(tileset)) {
    if (last < count) continue;
    const what = joins ? `Its ${JOIN_FRAMES} joins run to frame ${last}` : `Frame ${last} is past the sheet`;
    found.push(at(path, `${what}: the sheet has ${count}, from 0 to ${count - 1}`));
  }
  return found;
}

/** E092 over the project's tileset records, each sheet read once. */
export async function checkTilesets(
  source: ProjectSource,
  records: readonly RecordInput[],
  assets: ReadonlySet<string>,
): Promise<Diagnostic[]> {
  const read = sheetReader(source);
  const diagnostics: Diagnostic[] = [];
  for (const record of records) {
    if (record.type !== TILESET || record.unreadable) continue;
    const sheet = spriteSheetOf(record.value, assets);
    if (sheet !== null) diagnostics.push(...tilesetDiagnostics(record, await read(sheet)));
  }
  return diagnostics;
}
