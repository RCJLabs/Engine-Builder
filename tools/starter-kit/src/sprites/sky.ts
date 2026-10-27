/**
 * The starter sprites' night (M7.1, D83): the sky, banded from dusk at the horizon to night above
 * through a checker of the two; stars that twinkle in two frames; a moon; and two ridges whose
 * edges are sums of triangle waves whose periods divide their width, so each tiles across.
 */
import { hash, Sheet } from './raster.ts';

export const SKY_HEIGHT = 180;

/** 16 by 180: dusk to 60, a checker to 76, night above. */
export function skySheet(): Sheet {
  const sheet = new Sheet(16, SKY_HEIGHT, 1);
  const f = sheet.frame(0);
  for (let y = 0; y < SKY_HEIGHT; y++)
    for (let x = 0; x < 16; x++) f.set(x, y, y < 60 || (y < 76 && (x + y) % 2 === 0) ? 'dusk' : 'night');
  return sheet;
}

/** 128 by 96: about one pixel in 130 a star, one in five of those bright; a third go out in the second frame. */
export function starsSheet(): Sheet {
  const sheet = new Sheet(128, 96, 2);
  for (const n of [0, 1]) {
    const f = sheet.frame(n);
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 128; x++) {
        const h = hash(7, x, y);
        if (h % 131 !== 0) continue;
        if (n === 1 && (h >>> 8) % 3 === 0) continue;
        f.set(x, y, (h >>> 4) % 5 === 0 ? 'moon' : 'star');
      }
  }
  return sheet;
}

/** 24 by 24: a full moon with three shallow seas. */
export function moonSheet(): Sheet {
  const sheet = new Sheet(24, 24, 1);
  const f = sheet.frame(0);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const dx = 2 * x - 23;
      const dy = 2 * y - 23;
      if (dx * dx + dy * dy > 19 * 19) continue;
      const sea = [
        [9, 15, 3],
        [15, 10, 4],
        [8, 8, 2],
      ].some(([cx, cy, r]) => (x - (cx as number)) ** 2 + (y - (cy as number)) ** 2 <= (r as number) ** 2);
      f.set(x, y, sea ? 'stoneLight' : 'moon');
    }
  return sheet;
}

/** |2(x mod p) − p| scaled to 0..a: a triangle wave of period p. */
const tri = (x: number, p: number, a: number) => Math.floor((a * Math.abs(2 * (x % p) - p)) / p);

/** 256 by 64: far mountains in the ridge's blue. */
export function ridgeFarSheet(): Sheet {
  const sheet = new Sheet(256, 64, 1);
  const f = sheet.frame(0);
  for (let x = 0; x < 256; x++) {
    const top = 20 + tri(x + 40, 128, 26) + tri(x + 7, 64, 10) + tri(x, 16, 3);
    f.rect(x, 0, 1, Math.min(top, 64), 'ridge');
  }
  return sheet;
}

/** 256 by 48: near hills in night's blue, with pines along their top. */
export function ridgeNearSheet(): Sheet {
  const sheet = new Sheet(256, 48, 1);
  const f = sheet.frame(0);
  const top = (x: number) => 16 + tri(x + 90, 256, 12) + tri(x + 20, 64, 6) + tri(x, 16, 2);
  for (let x = 0; x < 256; x++) f.rect(x, 0, 1, top(x), 'night');
  for (let x = 4; x < 256; x += 9) {
    if (hash(11, x) % 3 === 0) continue;
    const base = top(x);
    for (let k = 0; k < 7; k++)
      f.rect(x - Math.floor((7 - k) / 3), base + k, 2 * Math.floor((7 - k) / 3) + 1, 1, 'night');
  }
  return sheet;
}
