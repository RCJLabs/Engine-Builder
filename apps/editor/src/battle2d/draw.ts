/**
 * A battle drawn by stage2d's own drawer (M7.5, D87, docs/specs/tactics.md#the-stage), over the space as drawn:
 * the tiles the selected can reach, a dash's apart; the preview's path, or its line to the target; the units on
 * their tiles as their actors' sprites, the foes facing left, each with its hit points; the selected's ring, the
 * keyboard's cursor and a shot played back. Whole art pixels, as the rest of the stage.
 */
import type { PackTiles, Tile } from '@eb/core';
import type { StepView } from '@eb/kits';
import type { SpriteRecord } from '@eb/schema';
import type { Point } from '../stage2d/camera.ts';
import { clipOf, frameAt, frameBox } from '../stage2d/clips.ts';
import type { Sheets } from '../stage2d/draw.ts';
import { onCanvas, originOf, type Rect } from '../stage2d/place.ts';
import type { Preview } from './pick.ts';
import type { Shown } from './playback.ts';

/** The overlay's colours: a walk, a dash, the path, the ring and cursor, a hit and a miss, the hit points. */
export const COLOURS = {
  walk: '#3d7ad6',
  dash: '#d6a33d',
  path: '#f4f1e8',
  ring: '#f2d16b',
  cursor: '#ffffff',
  hit: '#ff6a4a',
  miss: '#9aa4b5',
  crew: '#5fd068',
  foes: '#e0524a',
  empty: '#1b1d2a',
} as const;

export interface UnitLook {
  readonly id: string;
  readonly side: 'crew' | 'foes';
  readonly actor: string;
  readonly most: number;
  readonly watch: boolean;
}

export interface BattleAsk {
  readonly tiles: PackTiles;
  readonly corner: Point;
  readonly rows: number;
  readonly sheets: Sheets;
  /** An actor's sprite, by the actor's record. */
  readonly spriteOf: (actor: string) => string | undefined;
  readonly units: readonly UnitLook[];
  readonly shown: ReadonlyMap<string, Shown>;
  /** The selected's reach, while it is the crew's turn and nothing plays back. */
  readonly reach: readonly StepView[];
  readonly selected?: string;
  readonly preview?: Preview;
  readonly cursor?: Tile;
  readonly shot?: { readonly from: string; readonly to: string; readonly hit: boolean };
  readonly t: number;
  readonly still: boolean;
}

/** A tile's box in world art pixels; rows count down from the map's top, as the sim's do. */
function tileBox(tiles: PackTiles, [c, r]: readonly [number, number]): Rect {
  const [w, h] = tiles.tile;
  return { x: Math.round(tiles.at[0] + c * w), y: Math.round(tiles.at[1] + (tiles.size[1] - 1 - r) * h), w, h };
}

/** Where a unit's feet go on a tile: its centre, whole pixels. */
const feetOf = (tiles: PackTiles, at: readonly [number, number]): Point => {
  const box = tileBox(tiles, at);
  return [box.x + Math.floor(tiles.tile[0] / 2), box.y + Math.floor(tiles.tile[1] / 4)];
};

function fillTile(ctx: CanvasRenderingContext2D, ask: BattleAsk, at: Tile, colour: string, alpha: number): void {
  const box = onCanvas(tileBox(ask.tiles, at), ask.corner, ask.rows);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.fillRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
  ctx.globalAlpha = 1;
}

function outline(ctx: CanvasRenderingContext2D, box: Rect, colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(box.x, box.y, box.w, 1);
  ctx.fillRect(box.x, box.y + box.h - 1, box.w, 1);
  ctx.fillRect(box.x, box.y, 1, box.h);
  ctx.fillRect(box.x + box.w - 1, box.y, 1, box.h);
}

/** A line of whole pixels from a to b on the canvas, a pixel a step along the longer axis. */
function pixelLine(ctx: CanvasRenderingContext2D, a: Point, b: Point, colour: string): void {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
  ctx.fillStyle = colour;
  for (let i = 0; i <= n; i++)
    ctx.fillRect(Math.round(a[0] + ((b[0] - a[0]) * i) / n), Math.round(a[1] + ((b[1] - a[1]) * i) / n), 1, 1);
}

function centreOn(ask: BattleAsk, at: readonly [number, number]): Point {
  const box = onCanvas(tileBox(ask.tiles, at), ask.corner, ask.rows);
  return [box.x + Math.floor(box.w / 2), box.y + Math.floor(box.h / 2)];
}

function drawUnit(ctx: CanvasRenderingContext2D, ask: BattleAsk, unit: UnitLook, shown: Shown): Rect | undefined {
  const sprite = ask.spriteOf(unit.actor);
  const record: SpriteRecord | undefined = sprite === undefined ? undefined : ask.sheets.record(sprite);
  const image = sprite === undefined ? undefined : ask.sheets.image(sprite);
  if (sprite === undefined || !record || !image) return undefined;
  const walking = shown.at[0] % 1 !== 0 || shown.at[1] % 1 !== 0;
  const clip = clipOf(record, walking ? 'walk' : 'idle');
  const playing = clip === undefined ? undefined : record.clips[clip];
  const frame = playing ? frameAt(playing, ask.t, 0, ask.still) : 0;
  const src = { ...frameBox(record, ask.sheets.width(sprite), frame), w: record.frame[0], h: record.frame[1] };
  const [fx, fy] = feetOf(ask.tiles, shown.at);
  const [ox, oy] = originOf(record);
  const flip = unit.side === 'foes';
  const left = flip ? fx - (record.frame[0] - 1 - ox) : fx - ox;
  const box = onCanvas({ x: left, y: fy - oy, w: record.frame[0], h: record.frame[1] }, ask.corner, ask.rows);
  const fallen = shown.status !== 'active';
  ctx.globalAlpha = shown.status === 'dead' ? 0.25 : fallen ? 0.5 : 1;
  ctx.save();
  if (flip) {
    ctx.translate(box.x + box.w, box.y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, src.x, src.y, src.w, src.h, 0, 0, box.w, box.h);
  } else ctx.drawImage(image, src.x, src.y, src.w, src.h, box.x, box.y, box.w, box.h);
  ctx.restore();
  ctx.globalAlpha = 1;
  return box;
}

/** Its hit points over its head: a bar a pixel a point, its side's colour on dark. */
function drawHealth(ctx: CanvasRenderingContext2D, unit: UnitLook, shown: Shown, head: Rect): void {
  if (shown.status === 'dead') return;
  const w = Math.max(unit.most, 1);
  const x = head.x + Math.floor((head.w - w) / 2);
  ctx.fillStyle = COLOURS.empty;
  ctx.fillRect(x - 1, head.y - 4, w + 2, 3);
  ctx.fillStyle = unit.side === 'crew' ? COLOURS.crew : COLOURS.foes;
  ctx.fillRect(x, head.y - 3, Math.max(0, Math.min(w, shown.hp)), 1);
  if (unit.watch) ctx.fillRect(x, head.y - 6, 3, 1);
}

export function drawBattle(ctx: CanvasRenderingContext2D, ask: BattleAsk): void {
  ctx.imageSmoothingEnabled = false;
  for (const step of ask.reach) fillTile(ctx, ask, step.to, step.ap > 1 ? COLOURS.dash : COLOURS.walk, 0.35);
  const preview = ask.preview;
  if (preview?.kind === 'move') {
    for (const at of preview.step.path.slice(1)) {
      const [x, y] = centreOn(ask, at);
      ctx.fillStyle = COLOURS.path;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    outline(ctx, onCanvas(tileBox(ask.tiles, preview.step.to), ask.corner, ask.rows), COLOURS.path);
  }
  const from = (id: string) => ask.shown.get(id)?.at;
  if (preview?.kind === 'shoot') {
    const [a, b] = [from(preview.unit), from(preview.shot.target)];
    if (a && b) pixelLine(ctx, centreOn(ask, a), centreOn(ask, b), COLOURS.ring);
  }
  if (ask.shot) {
    const [a, b] = [from(ask.shot.from), from(ask.shot.to)];
    if (a && b) pixelLine(ctx, centreOn(ask, a), centreOn(ask, b), ask.shot.hit ? COLOURS.hit : COLOURS.miss);
  }
  const selected = ask.selected === undefined ? undefined : from(ask.selected);
  if (selected) outline(ctx, onCanvas(tileBox(ask.tiles, selected), ask.corner, ask.rows), COLOURS.ring);
  // The fallen first, so the standing are drawn over them; then down the map, nearer over further.
  const order = [...ask.units].sort((a, b) => {
    const [sa, sb] = [ask.shown.get(a.id), ask.shown.get(b.id)];
    const up = (s?: Shown) => (s?.status === 'active' ? 1 : 0);
    return up(sa) - up(sb) || (sa?.at[1] ?? 0) - (sb?.at[1] ?? 0);
  });
  for (const unit of order) {
    const shown = ask.shown.get(unit.id);
    if (!shown) continue;
    const head = drawUnit(ctx, ask, unit, shown);
    if (head) drawHealth(ctx, unit, shown, head);
  }
  if (ask.cursor) outline(ctx, onCanvas(tileBox(ask.tiles, ask.cursor), ask.corner, ask.rows), COLOURS.cursor);
}
