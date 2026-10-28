// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Seeded, code-drawn starfield. Generation is pure (seed in, plain data out);
// drawing only reads that data.
import { next } from '../core/rng.ts';
import { palette, rgba } from './palette.ts';

// Stars sit on a square tile of this many CSS px, repeated across the screen,
// so the same seed gives the same sky on both Fold screens.
const TILE = 1024;
const TINT_ORDER = ['star', 'starCool', 'starWarm'];

type Tint = 'star' | 'starCool' | 'starWarm';

export interface Star {
  x: number;
  y: number;
  depth: number;
  size: number;
  alpha: number;
  twinkle: number;
  phase: number;
  tint: Tint;
}

export interface Starfield {
  stars: Star[];
  nebulae: { x: number; y: number; radius: number; alpha: number; color: 'nebulaA' | 'nebulaB' }[];
}

export function makeStarfield(seed: number, count = 360): Starfield {
  let state = seed;
  const roll = () => {
    const r = next(state);
    state = r.state;
    return r.value;
  };

  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const depth = roll(); // 0 is far, 1 is near
    const tint = roll();
    const twinkles = roll() < 0.25;
    const twinkleSpeed = 0.6 + roll() * 1.4;
    stars.push({
      x: roll() * TILE,
      y: roll() * TILE,
      depth,
      size: 0.7 + depth * depth * 1.8,
      alpha: 0.3 + roll() * 0.7,
      twinkle: twinkles ? twinkleSpeed : 0,
      phase: roll() * Math.PI * 2,
      tint: tint < 0.7 ? 'star' : tint < 0.88 ? 'starCool' : 'starWarm',
    });
  }
  // Grouped by tint so drawing changes fillStyle only twice.
  stars.sort((a, b) => TINT_ORDER.indexOf(a.tint) - TINT_ORDER.indexOf(b.tint));

  const nebulae: Starfield['nebulae'] = [];
  for (let i = 0; i < 3; i++) {
    nebulae.push({
      x: roll(),
      y: roll(),
      radius: 0.35 + roll() * 0.35,
      alpha: 0.22 + roll() * 0.18,
      color: i % 2 ? 'nebulaB' : 'nebulaA',
    });
  }
  return { stars, nebulae };
}

// The static layer (background and nebulae), painted once per resize.
export function paintBackdrop(field: Starfield, view: { width: number; height: number; dpr: number }): OffscreenCanvas {
  // A stage draws in a worker, which has no document.
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(view.width * view.dpr)), Math.max(1, Math.round(view.height * view.dpr)));
  const g = canvas.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D;
  g.scale(view.dpr, view.dpr);
  const { width: w, height: h } = view;
  g.fillStyle = palette.space;
  g.fillRect(0, 0, w, h);
  const span = Math.max(w, h);
  for (const n of field.nebulae) {
    const cx = n.x * w;
    const cy = n.y * h;
    const r = n.radius * span;
    const gradient = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, rgba(palette[n.color], n.alpha));
    gradient.addColorStop(1, rgba(palette[n.color], 0));
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
  }
  return canvas;
}

// Stars drift left with parallax: near stars move faster than far ones.
export function drawStars(ctx: OffscreenCanvasRenderingContext2D, field: Starfield, view: { width: number; height: number }, timeMs: number): void {
  const { width: w, height: h } = view;
  const t = timeMs / 1000;
  let tint = '';
  for (const s of field.stars) {
    if (s.tint !== tint) {
      tint = s.tint;
      ctx.fillStyle = palette[s.tint];
    }
    let x = (s.x - t * (3 + s.depth * 9)) % TILE;
    if (x < 0) x += TILE;
    ctx.globalAlpha = s.twinkle ? s.alpha * (0.7 + 0.3 * Math.sin(t * s.twinkle + s.phase)) : s.alpha;
    const half = s.size / 2;
    for (let ty = s.y; ty < h + half; ty += TILE) {
      for (let tx = x; tx < w + half; tx += TILE) ctx.fillRect(tx - half, ty - half, s.size, s.size);
    }
  }
  ctx.globalAlpha = 1;
}
