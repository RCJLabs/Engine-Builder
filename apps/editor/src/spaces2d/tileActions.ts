/**
 * A tilemap's edits as steps of the editor's undo (M7.2, D84, docs/specs/tilemaps.md#the-editor): a
 * new tilemap put in the middle of the view, chosen; a stroke of Paint, Erase or Edges, one step
 * however many cells it crossed; and Import ASCII…, one step, refused whole while a character is no
 * tile. Each works on the open file's top-level object it names.
 */
import { isTilemap, type SpaceJson, type TilemapFields } from '@eb/compiler';
import type { EdgeKind } from '@eb/core';
import { editOpen } from '../spaces/actions.ts';
import { addObject } from '../spaces/spaceEdits.ts';
import { withTransform } from '../spaces/spaceFile.ts';
import { pick } from '../spaces/state.ts';
import type { Point } from '../stage2d/camera.ts';
import { aim2d } from './state2d.ts';
import { type Cell, importText, newTilemap, paintCells, type Side, setEdges, withTilemap } from './tilemapEdits.ts';

/** The tilemap fields of the open file's top-level object `id`, when it has a tilemap. */
export function tilemapOf(space: SpaceJson | undefined, id: string): TilemapFields | undefined {
  const fields = space?.objects.find((object) => object.id === id)?.components?.tilemap;
  return isTilemap(fields) ? fields : undefined;
}

/** A tilemap of `size` tiles of `tile` pixels, centred in the view at whole pixels, and chosen. */
export async function addTilemap(tileset: string, size: readonly [number, number], tile: Point): Promise<void> {
  const [x, y] = aim2d.value;
  const at: [number, number, number] = [
    Math.round(x - (size[0] * tile[0]) / 2),
    Math.round(y - (size[1] * tile[1]) / 2),
    0,
  ];
  let made = '';
  await editOpen('Add tilemap', (space) => {
    const added = addObject(space, withTransform(newTilemap(tileset, size), { at, turn: [0, 0, 0], scale: [1, 1, 1] }));
    made = added.id;
    return added.space;
  });
  if (made) pick([made]);
}

const edited = (id: string, change: (fields: TilemapFields) => TilemapFields) => (space: SpaceJson) => {
  const fields = tilemapOf(space, id);
  return fields ? withTilemap(space, id, change(fields)) : space;
};

/** A stroke of Paint (a tile's character) or Erase (a space) over `cells` of layer `layer`. */
export function paintStroke(id: string, layer: number, cells: readonly Cell[], ch: string): Promise<void> {
  if (cells.length === 0) return Promise.resolve();
  const label = `${ch === ' ' ? 'Erase' : 'Paint'} ${cells.length === 1 ? 'a tile' : `${cells.length} tiles`}`;
  return editOpen(
    label,
    edited(id, (fields) => paintCells(fields, layer, cells, ch)),
  );
}

/** A stroke of Edges: `kind` on each side crossed, or none. */
export function edgeStroke(
  id: string,
  sides: readonly { cell: Cell; side: Side }[],
  kind: EdgeKind | null,
): Promise<void> {
  if (sides.length === 0) return Promise.resolve();
  const label = `${kind === null ? 'Clear' : `Set ${kind}`} ${sides.length === 1 ? 'an edge' : `${sides.length} edges`}`;
  return editOpen(
    label,
    edited(id, (fields) => setEdges(fields, sides, kind)),
  );
}

/** Pasted text into layer `layer`: the characters no tile is, when it refuses it, else none. */
export async function importAscii(
  id: string,
  space: SpaceJson | undefined,
  layer: number,
  text: string,
  chars: ReadonlySet<string>,
): Promise<readonly string[]> {
  const fields = tilemapOf(space, id);
  if (!fields) return [];
  const done = importText(fields, layer, text, chars);
  if ('unknown' in done) return done.unknown;
  await editOpen('Import ASCII', (now) => withTilemap(now, id, done.fields));
  return [];
}
