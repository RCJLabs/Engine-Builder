/**
 * A 2D space drawn on a canvas of art pixels (M7.1, D83, docs/specs/2d-scenes.md#the-view): the
 * backdrop, then each item in draw order at whole pixels, smoothing off, so every pixel the canvas
 * holds is one of the sheets' own or a shape's colour. The page shows the canvas at a whole scale,
 * pixelated. Canvas 2D, not three: drawImage at whole pixels is exact by construction, and the stage
 * carries no renderer (D83's As built). The Scene panel's 2D view draws with it too. A tilemap
 * (M7.2) draws its tiles, edges and posts at its depth, only those inside the view.
 */
import type { SpriteRecord, TilesetRecord } from '@eb/schema';
import { type Point, viewCorner } from './camera.ts';
import { clipOf, frameAt, frameBox } from './clips.ts';
import { drawnAt, onCanvas, type Rect, tiles, worldBox } from './place.ts';
import type { Item } from './scene.ts';
import { type TileDraw, tileDraws } from './tilemap2d.ts';

export interface Sheets {
  record(sprite: string): SpriteRecord | undefined;
  image(sprite: string): CanvasImageSource | undefined;
  /** The sheet's width in pixels, for a frame's place on it. */
  width(sprite: string): number;
  /** A tileset and its decoded sheet (M7.2); a view that draws no tilemaps leaves it out. */
  tileset?(
    id: string,
  ): { readonly record: TilesetRecord; readonly image: CanvasImageSource & { width: number } } | undefined;
}

/** Where a walker stands now, by its actor, and how it looks: the stage's own, never the sim's. */
export interface Walking {
  readonly at: Point;
  readonly flip: boolean;
  readonly moving: boolean;
}

/** What one item looked like as it was drawn: the hook's. */
export interface Drawn {
  readonly path: string;
  readonly sprite?: string;
  readonly clip?: string;
  readonly frame?: number;
  /** Its world place, whole pixels, a parallax layer's as moved. */
  readonly at: Point;
  readonly flip: boolean;
  /** Its box on the canvas: the first tile of a layer that repeats. */
  readonly box: Rect;
}

export interface FrameAsk {
  readonly items: readonly Item[];
  readonly sheets: Sheets;
  readonly walking: ReadonlyMap<string, Walking>;
  readonly camera: Point;
  readonly view: Point;
  /** Seconds since the space was first drawn, and whether clips hold still (reduced motion). */
  readonly t: number;
  readonly still: boolean;
  readonly backdrop: string;
}

function blit(ctx: CanvasRenderingContext2D, image: CanvasImageSource, src: Rect, to: Rect, flip: boolean): void {
  if (!flip) {
    ctx.drawImage(image, src.x, src.y, src.w, src.h, to.x, to.y, to.w, to.h);
    return;
  }
  ctx.save();
  ctx.translate(to.x + to.w, to.y);
  ctx.scale(-1, 1);
  ctx.drawImage(image, src.x, src.y, src.w, src.h, 0, 0, to.w, to.h);
  ctx.restore();
}

function shape(ctx: CanvasRenderingContext2D, kind: 'box' | 'sphere', colour: string, box: Rect): void {
  ctx.fillStyle = colour;
  if (kind === 'box') {
    ctx.fillRect(box.x, box.y, box.w, box.h);
    return;
  }
  // A circle by whole rows: each row as wide as the circle is there, so its edge stays on pixels.
  const r = box.w / 2;
  for (let row = 0; row < box.h; row++) {
    const dy = row + 0.5 - r;
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.5);
    if (half > 0) ctx.fillRect(box.x + Math.floor(r) - half, box.y + row, half * 2, 1);
  }
}

/** What each tilemap draws, worked out again only when its fields, its tileset or its place change. */
const drawsOf = new WeakMap<object, { tileset: TilesetRecord; at: Point; draws: TileDraw[] }>();

function drawTilemap(
  ctx: CanvasRenderingContext2D,
  item: Item & { look: { kind: 'tilemap' } },
  at: Point,
  sheets: Sheets,
  corner: Point,
  view: Point,
): void {
  const found = sheets.tileset?.(item.look.map.tileset);
  if (!found) return;
  let known = drawsOf.get(item.look.map);
  if (!known || known.tileset !== found.record || known.at[0] !== at[0] || known.at[1] !== at[1]) {
    known = { tileset: found.record, at, draws: tileDraws(item.look.map, found.record, at) };
    drawsOf.set(item.look.map, known);
  }
  const [w, h] = found.record.tile;
  const across = Math.max(1, Math.floor(found.image.width / w));
  for (const { frame, box } of known.draws) {
    const to = onCanvas(box, corner, view[1]);
    if (to.x + to.w <= 0 || to.y + to.h <= 0 || to.x >= view[0] || to.y >= view[1]) continue;
    const src = { x: (frame % across) * w, y: Math.floor(frame / across) * h, w, h };
    ctx.drawImage(found.image, src.x, src.y, w, h, to.x, to.y, w, h);
  }
}

/** One frame: every item drawn, and how each was. */
export function drawFrame(ctx: CanvasRenderingContext2D, ask: FrameAsk): Drawn[] {
  const [cols, rows] = ask.view;
  const corner = viewCorner(ask.camera, ask.view);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = ask.backdrop;
  ctx.fillRect(0, 0, cols, rows);
  const drawn: Drawn[] = [];
  for (const item of ask.items) {
    const walking = item.actor === undefined ? undefined : ask.walking.get(item.actor);
    const at: Point = walking ? [Math.round(walking.at[0]), Math.round(walking.at[1])] : drawnAt(item, ask.camera);
    if (item.look.kind === 'tilemap') {
      drawTilemap(ctx, item as Item & { look: { kind: 'tilemap' } }, at, ask.sheets, corner, ask.view);
      drawn.push({ path: item.path, at, flip: false, box: onCanvas(worldBox(item, at, undefined), corner, rows) });
      continue;
    }
    if (item.look.kind !== 'sprite') {
      const box = onCanvas(worldBox(item, at, undefined), corner, rows);
      shape(ctx, item.look.kind, item.look.colour, box);
      drawn.push({ path: item.path, at, flip: false, box });
      continue;
    }
    const record = ask.sheets.record(item.look.sprite);
    const image = ask.sheets.image(item.look.sprite);
    if (!record || !image) continue;
    const flip = walking ? walking.flip !== item.look.flip : item.look.flip;
    const wanted = walking ? (walking.moving ? 'walk' : 'idle') : item.look.clip;
    const clip = clipOf(record, wanted);
    const playing = clip === undefined ? undefined : record.clips[clip];
    const frame = playing ? frameAt(playing, ask.t, item.look.phase, ask.still) : 0;
    const src = {
      ...frameBox(record, ask.sheets.width(item.look.sprite), frame),
      w: record.frame[0],
      h: record.frame[1],
    };
    const box = onCanvas(worldBox({ ...item, look: { ...item.look, flip } }, at, record), corner, rows);
    const lefts = item.parallax?.repeat ? tiles(box.x, box.w, 0, cols) : [box.x];
    for (const x of lefts) blit(ctx, image, src, { ...box, x }, flip);
    drawn.push({ path: item.path, sprite: item.look.sprite, ...(clip ? { clip } : {}), frame, at, flip, box });
  }
  return drawn;
}
