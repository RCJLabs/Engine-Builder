/**
 * A stroke of Paint, Erase or Edges over a tilemap (M7.2, D84, docs/specs/tilemaps.md#the-editor):
 * each world point the pointer crosses marks the cell under it, or the side of a cell nearest it, and
 * the points between two that arrive far apart are filled in at half a tile, so a fast drag leaves no
 * gaps; a stroke of Edges keeps to the axis of its first side, so a drag along a wall never catches a
 * side across it at a corner. The fields as the stroke would leave them are previewed as it goes; its end commits the cells
 * or sides once, as one step.
 */
import type { TilemapFields } from '@eb/compiler';
import type { EdgeKind } from '@eb/core';
import type { Point } from '../stage2d/camera.ts';
import type { Painter } from './gestures2d.ts';
import { type Cell, cellAt, type MapPlace, nearestSide, paintCells, type Side, setEdges } from './tilemapEdits.ts';

export interface PaintAsk {
  readonly place: MapPlace;
  readonly fields: TilemapFields;
  readonly tool: 'paint' | 'erase' | 'edges';
  readonly layer: number;
  /** The character Paint lays. */
  readonly ch: string;
  readonly kind: EdgeKind | null;
  preview(fields: TilemapFields | null): void;
  commit(cells: readonly Cell[], sides: readonly { cell: Cell; side: Side }[]): void;
}

export function tilePainter(ask: PaintAsk): Painter {
  const cells = new Map<string, Cell>();
  const sides = new Map<string, { cell: Cell; side: Side }>();
  let last: Point | null = null;
  let along: 'across' | 'down' | undefined;
  const visit = (p: Point) => {
    if (ask.tool === 'edges') {
      const found = nearestSide(ask.place, p, along);
      if (!found) return;
      along ??= found.side === 'n' || found.side === 's' ? 'across' : 'down';
      sides.set(`${found.cell.join()}:${found.side}`, found);
    } else {
      const cell = cellAt(ask.place, p);
      if (cell) cells.set(cell.join(), cell);
    }
  };
  const now = () =>
    ask.tool === 'edges'
      ? setEdges(ask.fields, [...sides.values()], ask.kind)
      : paintCells(ask.fields, ask.layer, [...cells.values()], ask.tool === 'erase' ? ' ' : ask.ch);
  return {
    at(p) {
      if (last) {
        const half = Math.max(1, Math.min(...ask.place.tile) / 2);
        const steps = Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1]) / half);
        for (let i = 1; i < steps; i++)
          visit([last[0] + ((p[0] - last[0]) * i) / steps, last[1] + ((p[1] - last[1]) * i) / steps]);
      }
      visit(p);
      last = p;
      ask.preview(now());
    },
    end() {
      ask.commit([...cells.values()], [...sides.values()]);
    },
    cancel() {
      ask.preview(null);
    },
  };
}
