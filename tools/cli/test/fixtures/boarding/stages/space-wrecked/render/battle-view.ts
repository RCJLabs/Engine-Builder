// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Draws a battle map: deep space, then the map's solid scene
// (battleScene.js) and whatever stands on it (units.js), lit and drawn back
// to front together by the painter, so walls hide what is behind them.
// Works in CSS pixels; the caller sets the device-pixel transform and clips
// to the board. Never changes the map.
//   board = createBattleBoard()
//   board.setMap(input)          { map, skin, open } (see battleScene), or null
//   board.setActors(input)       { faces, glows, figures? }: marks on the
//                                deck and the units' figures (units.js),
//                                or null
//   board.draw(ctx, cam, rect, overlay, { animating })
//                                overlay(ctx), if given, draws on top
//                                (labels, shots in flight); animating says
//                                units are moving. True means this frame was
//                                a rough one (the camera or units moved, on
//                                a phone too slow for full frames, or some
//                                figures still wait to be drawn): draw
//                                again once it settles
//   board.frameStats()           for the dev overlay (frameBudget.js)
import type { BattleMap } from '../sim/map-from-ship.ts';
import { battleScene } from './battle-scene.ts';
import { createFigureSprites, type Figure } from './figures/sprites.ts';
import { createFrameBudget } from './frame-budget.ts';
import { type Layer, paintLayer } from './layer.ts';
import type { Cam, Rect, View } from './orbit.ts';
import { type Glow, paintSolid, prepareSolid, type Solid } from './painter.ts';
import { palette, type Skin } from './palette.ts';
import { drawSpace } from './ship-view.ts';
import { type Face, shade } from './solid.ts';

type Ctx = OffscreenCanvasRenderingContext2D;

const deg = Math.PI / 180;

// The camera a battle map opens at: the builder's angle, a little nearer,
// so the same ship looks the same in both.
export const BATTLE_VIEW: View = { yaw: -11 * deg, pitch: 60 * deg, distance: 40 };

// The camera a fight opens at: square to the ship, where tiles come out
// biggest for the player's taps (48 px and more for the example ship on the
// Fold's cover screen, against 39 at the builder's angle). Twist to turn it.
export const FIGHT_VIEW: View = { ...BATTLE_VIEW, yaw: 0 };

const NONE: { faces: Solid[]; glows: Glow[]; figures: Figure[] } = { faces: [], glows: [], figures: [] };

export function createBattleBoard() {
  let scene: { faces: Solid[]; glows: Glow[]; space: string } | null = null;
  let actors = NONE;
  // The map as last drawn in full, reused until something changes; a
  // half-resolution canvas for rough frames, drawn without outlines; and
  // the budget that picks between them while the camera moves.
  const still: Layer & { cam: Cam | null; scene: typeof scene; actors: typeof actors | null; rect: Rect | null; ratio: number } = { canvas: null, cam: null, scene: null, actors: null, rect: null, ratio: 0 };
  const lowRes: Layer = { canvas: null };
  const budget = createFrameBudget();
  // Figures are drawn once and kept, a drawing for each angle, pose and size.
  const sprites = createFigureSprites();
  // Space behind the map doesn't move with it, so it is painted once per
  // size and pixel ratio.
  const backdrops = new Map<number, Layer & { key: string }>();
  let lastCam: Cam | null = null;
  return {
    setMap(input: { map: BattleMap; skin: Skin; open?: string[] } | null) {
      scene = null;
      if (input) {
        const { faces, glows } = battleScene(input);
        scene = { faces: prepareSolid(faces, shade), glows, space: input.skin.space };
      }
      lastCam = null; // the next frame is a full one
    },
    setActors(input: { faces: Face[]; glows: Glow[]; figures?: Figure[] } | null) {
      actors = input ? { faces: prepareSolid(input.faces, shade), glows: input.glows, figures: input.figures ?? [] } : NONE;
    },
    draw(ctx: Ctx, cam: Cam | null, rect: Rect, overlay?: ((ctx: Ctx) => void) | null, { animating = false } = {}): boolean {
      const moving = Boolean(cam && lastCam && cam !== lastCam) || animating;
      lastCam = cam;
      const ratio = ctx.getTransform().a;
      if (still.cam === cam && still.scene === scene && still.actors === actors && still.rect === rect && still.ratio === ratio) {
        // Nothing on the board changed: the last full frame will do.
        ctx.drawImage(still.canvas as OffscreenCanvas, rect.x, rect.y, rect.w, rect.h);
      } else if (budget.full(moving)) {
        // Timed with the copy to the screen, which is where a phone that
        // draws canvas without its GPU fills the pixels.
        budget.measure(() => ctx.drawImage(paintLayer(still, rect, ratio, (g) => paint(g, cam, rect, ratio, true)), rect.x, rect.y, rect.w, rect.h));
        Object.assign(still, { cam, scene, actors, rect, ratio });
        if (sprites.stale()) {
          // Some figures showed an older drawing: draw again soon.
          still.cam = null;
          overlay?.(ctx);
          return true;
        }
      } else {
        ctx.drawImage(paintLayer(lowRes, rect, 1, (g) => paint(g, cam, rect, ratio, false)), rect.x, rect.y, rect.w, rect.h);
        still.cam = null;
        overlay?.(ctx);
        return true;
      }
      overlay?.(ctx);
      return false;
    },
    frameStats: () => budget.stats(),
  };

  // ratio: the device pixels per CSS pixel figures are drawn at, those of
  // a full frame even in a rough one.
  function paint(g: Ctx, cam: Cam | null, rect: Rect, ratio: number, edges: boolean): void {
    g.drawImage(backdrop(rect, g.getTransform().a, scene?.space ?? palette.space), rect.x, rect.y, rect.w, rect.h);
    if (!scene || !cam) return;
    const faces = actors.faces.length ? scene.faces.concat(actors.faces) : scene.faces;
    sprites.frame();
    const items = actors.figures.map((figure) => sprites.item(figure, ratio));
    paintSolid(g, faces, actors.glows.length ? scene.glows.concat(actors.glows) : scene.glows, cam, { edges, items });
  }

  function backdrop(rect: Rect, ratio: number, color: string): OffscreenCanvas {
    const key = [rect.x, rect.y, rect.w, rect.h, color].join();
    let kept = backdrops.get(ratio);
    if (kept?.key !== key) {
      kept = { canvas: kept?.canvas ?? null, key };
      paintLayer(kept, rect, ratio, (g) => drawSpace(g, rect, color));
      backdrops.set(ratio, kept);
    }
    return kept.canvas as OffscreenCanvas;
  }
}

export type BattleBoard = ReturnType<typeof createBattleBoard>;
