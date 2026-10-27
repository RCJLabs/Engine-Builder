/**
 * Show rules over a chosen tilemap in the 2D view (M7.2, D84, docs/specs/tilemaps.md#the-editor): each
 * cell tinted by its rules as play packs them (walked on, half cover, full cover or blocking sight,
 * empty), and each edge that stops a walker or sight drawn as a line; a door, which lets walkers
 * through, in its own colour. Drawn on the view's canvas over the map, in the editor alone.
 */
import { cellRules, type TilemapFields } from '@eb/compiler';
import { BLOCKS_SIGHT, FULL_COVER, HALF_COVER, readEdges, WALK } from '@eb/core';
import type { TilesetRecord } from '@eb/schema';
import type { Point } from '../stage2d/camera.ts';

const WALKED = 'rgb(80 200 120 / 45%)';
const HALF = 'rgb(255 200 60 / 50%)';
const BLOCKED = 'rgb(230 70 70 / 50%)';
const WALLED = 'rgb(230 70 70)';
const DOOR = 'rgb(80 170 255)';

/** The rules over a map whose bottom-left is `at`, on a canvas whose bottom-left world pixel is `corner`. */
export function drawRules(
  ctx: CanvasRenderingContext2D,
  fields: TilemapFields,
  tileset: TilesetRecord,
  at: Point,
  corner: Point,
  canvasRows: number,
): void {
  const [cols, rows] = fields.size;
  const [w, h] = tileset.tile;
  const x = (c: number) => at[0] + c * w - corner[0];
  // The canvas's y runs down: row r's top is the map's top less r tiles.
  const y = (r: number) => canvasRows - (at[1] + (rows - r) * h - corner[1]);
  cellRules(fields, tileset).forEach((line, r) => {
    for (let c = 0; c < cols; c++) {
      const rule = Number.parseInt(line[c] ?? '0', 16);
      const fill =
        rule & (FULL_COVER | BLOCKS_SIGHT) ? BLOCKED : rule & HALF_COVER ? HALF : rule & WALK ? WALKED : null;
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(x(c) + 1, y(r) + 1, w - 2, h - 2);
    }
  });
  const edges = readEdges(fields.edges ?? [], cols, rows);
  for (const [r, line] of edges.across.entries())
    for (const [c, kind] of line.entries()) {
      if (!kind) continue;
      ctx.fillStyle = kind === 'door' ? DOOR : WALLED;
      ctx.fillRect(x(c), y(r) - 1, w, 2);
    }
  for (const [r, line] of edges.down.entries())
    for (const [c, kind] of line.entries()) {
      if (!kind) continue;
      ctx.fillStyle = kind === 'door' ? DOOR : WALLED;
      ctx.fillRect(x(c) - 1, y(r), 2, h);
    }
}
