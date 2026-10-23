/**
 * A game's icons (docs/specs/export.md#icons): from export.json's PNG, scaled down by averaging,
 * or drawn in the theme's colours when there is none. The maskable and Apple icons keep their art
 * inside the middle 80%, the maskable safe zone, on the background colour (from Dirtbag's
 * app/build/pwa.ts). M10.2's icon painter will draw better ones.
 */
import { decodePng, encodePng, type Rgba } from './png.ts';

export interface IconColours {
  /** The splash screen's and the maskable icon's ground, as "#rrggbb". */
  readonly background: string;
  /** The drawn icon's tile. */
  readonly theme: string;
  /** The drawn icon's mark. */
  readonly accent: string;
}

/** Each icon's path in a web build, and its size. */
export const ICONS = {
  'icons/icon-192.png': 192,
  'icons/icon-512.png': 512,
  'icons/icon-512-maskable.png': 512,
  'icons/apple-touch-icon.png': 180,
  'icons/favicon.png': 32,
} as const;

export type IconPath = keyof typeof ICONS;

const FULL_BLEED = new Set<IconPath>(['icons/icon-512-maskable.png', 'icons/apple-touch-icon.png']);

const rgb = (colour: string): [number, number, number] => [
  Number.parseInt(colour.slice(1, 3), 16),
  Number.parseInt(colour.slice(3, 5), 16),
  Number.parseInt(colour.slice(5, 7), 16),
];

/**
 * The image scaled to `size` square by area averaging: each pixel out is the mean of the source
 * area it covers, its colour weighted by alpha so a transparent edge doesn't darken it.
 */
export function scaled(src: Rgba, size: number): Rgba {
  const out = new Uint8Array(size * size * 4);
  const fx = src.width / size;
  const fy = src.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = y * fy;
    const y1 = y0 + fy;
    for (let x = 0; x < size; x++) {
      const x0 = x * fx;
      const x1 = x0 + fx;
      const sum = [0, 0, 0, 0];
      let area = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          const i = (sy * src.width + sx) * 4;
          const alpha = (src.data[i + 3] as number) / 255;
          for (let c = 0; c < 3; c++) (sum[c] as number) += (src.data[i + c] as number) * alpha * w;
          (sum[3] as number) += alpha * w;
          area += w;
        }
      }
      const a = (sum[3] as number) / area;
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = a > 0 ? Math.round((sum[c] as number) / (a * area)) : 0;
      out[o + 3] = Math.round(a * 255);
    }
  }
  return { width: size, height: size, data: out };
}

/** The art on a ground of `background`, full bleed, scaled to fit the middle `zone` of it. */
export function onGround(art: Rgba, size: number, background: string, zone = 0.8): Rgba {
  const inner = Math.round(size * zone);
  const small = scaled(art, inner);
  const [r, g, b] = rgb(background);
  const out = new Uint8Array(size * size * 4);
  const offset = Math.floor((size - inner) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const ix = x - offset;
      const iy = y - offset;
      const inside = ix >= 0 && iy >= 0 && ix < inner && iy < inner;
      const a = inside ? (small.data[(iy * inner + ix) * 4 + 3] as number) / 255 : 0;
      const pick = (c: number, ground: number) =>
        Math.round((inside ? (small.data[(iy * inner + ix) * 4 + c] as number) : 0) * a + ground * (1 - a));
      out.set([pick(0, r), pick(1, g), pick(2, b), 255], o);
    }
  }
  return { width: size, height: size, data: out };
}

/**
 * The engine's own icon: a tile in the theme colour with a ring and a dot in the accent, drawn at
 * four samples a side for smooth edges. Full bleed, the tile is the whole ground.
 */
export function drawnIcon(size: number, colours: IconColours, fullBleed: boolean): Rgba {
  const out = new Uint8Array(size * size * 4);
  const tile = rgb(fullBleed ? colours.background : colours.theme);
  const mark = rgb(colours.accent);
  const n = 4;
  const centre = size / 2;
  const radius = size * 0.22;
  const width = size * 0.07;
  const dot = size * 0.07;
  const corner = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inTile = 0;
      let inMark = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const px = x + (sx + 0.5) / n;
          const py = y + (sy + 0.5) / n;
          const dx = Math.max(corner - px, 0, px - (size - corner));
          const dy = Math.max(corner - py, 0, py - (size - corner));
          if (fullBleed || dx * dx + dy * dy <= corner * corner) inTile++;
          // sqrt, not hypot: IEEE 754 rounds sqrt exactly, so every engine draws the same bytes.
          const d = Math.sqrt((px - centre) * (px - centre) + (py - centre) * (py - centre));
          if (Math.abs(d - radius) <= width / 2 || d <= dot) inMark++;
        }
      }
      const t = inTile / (n * n);
      const m = Math.min(inMark, inTile) / (n * n);
      const o = (y * size + x) * 4;
      // The mark is drawn over the tile: within the tile, its share of the colour is m / t.
      const share = t > 0 ? m / t : 0;
      for (let c = 0; c < 3; c++)
        out[o + c] = Math.round((mark[c] as number) * share + (tile[c] as number) * (1 - share));
      out[o + 3] = Math.round(t * 255);
    }
  }
  return { width: size, height: size, data: out };
}

/** The PNG export.json names, checked: square and at least 512 px. */
export function readIcon(bytes: Uint8Array): Rgba {
  const icon = decodePng(bytes);
  if (icon.width !== icon.height) throw new Error(`It is ${icon.width}×${icon.height}: an icon must be square`);
  if (icon.width < 512) throw new Error(`It is ${icon.width} px: an icon must be at least 512 px`);
  return icon;
}

/** Every icon of a web build, by path. */
export function iconFiles(source: Rgba | undefined, colours: IconColours): Map<IconPath, Uint8Array> {
  const files = new Map<IconPath, Uint8Array>();
  for (const [path, size] of Object.entries(ICONS) as [IconPath, number][]) {
    const fullBleed = FULL_BLEED.has(path);
    const image = source
      ? fullBleed
        ? onGround(source, size, colours.background)
        : scaled(source, size)
      : drawnIcon(size, colours, fullBleed);
    files.set(path, encodePng(image));
  }
  return files;
}
