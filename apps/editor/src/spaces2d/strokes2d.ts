/**
 * The stroke a press starts in the 2D view (M7.2's tiles, M7.3's rooms): while a tile tool is on and a
 * tilemap is chosen alone, the tile painter; while a room tool is on and a building is chosen alone, the
 * room painter; else none, and the press chooses and pans. A stroke's preview is the chosen object's
 * component as the stroke would leave it, laid over the file until the file comes back changed.
 */
import type { BuildingFields, SpaceJson, TilemapFields } from '@eb/compiler';
import type { sceneOf } from '../stage2d/scene.ts';
import { buildingOf, buildingStep } from './buildingActions.ts';
import { withBuilding } from './buildingEdits.ts';
import type { Painter } from './gestures2d.ts';
import { tilePainter } from './painter2d.ts';
import { roomPainter } from './roomPainter.ts';
import { roomChoice, roomTool } from './rooms2d.ts';
import { edgeStroke, paintStroke, tilemapOf } from './tileActions.ts';
import { withTilemap } from './tilemapEdits.ts';
import { edgeKind, tileChar, tileLayer, tileTool } from './tiles2d.ts';

export type Stroke =
  | { readonly id: string; readonly tilemap: TilemapFields }
  | { readonly id: string; readonly building: BuildingFields };

/** The space with a stroke's preview laid over it. */
export const withStroke = (space: SpaceJson, stroke: Stroke | null): SpaceJson =>
  !stroke
    ? space
    : 'tilemap' in stroke
      ? withTilemap(space, stroke.id, stroke.tilemap)
      : withBuilding(space, stroke.id, stroke.building);

export interface PaintNow {
  readonly canEdit: boolean;
  /** The one object chosen, or null. */
  readonly only: string | null;
  readonly items: ReturnType<typeof sceneOf>;
  readonly space: SpaceJson;
}

export function painterNow(now: PaintNow, setStroke: (s: Stroke | null) => void): Painter | null {
  const id = now.only;
  const item = id ? now.items.find((i) => i.path === id) : undefined;
  if (!now.canEdit || !id || !item) return null;
  if (item.look.kind === 'building') return roomsNow(id, item.at, now.space, setStroke);
  const tool = tileTool.peek();
  const fields = tilemapOf(now.space, id);
  if (!tool || !fields || item.look.kind !== 'tilemap') return null;
  const ch = tileChar.peek();
  if (tool === 'paint' && ch === null) return null;
  const layer = Math.min(tileLayer.peek(), fields.layers.length - 1);
  return tilePainter({
    place: { at: item.at, size: fields.size, tile: item.look.tile },
    fields,
    tool,
    layer,
    ch: ch ?? ' ',
    kind: edgeKind.peek(),
    preview: (next) => setStroke(next ? { id, tilemap: next } : null),
    commit: (cells, sides) =>
      void (tool === 'edges'
        ? edgeStroke(id, sides, edgeKind.peek())
        : paintStroke(id, layer, cells, tool === 'erase' ? ' ' : (ch as string))),
  });
}

function roomsNow(
  id: string,
  at: readonly [number, number],
  space: SpaceJson,
  setStroke: (s: Stroke | null) => void,
): Painter | null {
  const tool = roomTool.peek();
  const fields = buildingOf(space, id);
  const room = roomChoice.peek();
  if (!tool || !fields || (tool === 'place' && room === null)) return null;
  return roomPainter({
    at,
    fields,
    tool,
    room: room ?? '',
    preview: (next) => setStroke(next ? { id, building: next } : null),
    commit: (change, label) => void buildingStep(id, label, change),
  });
}
