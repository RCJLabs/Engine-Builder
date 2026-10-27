/**
 * The starter sprites' keep (M7.1, D83): a wall that tiles across, battlements that tile above it,
 * a tower, a gatehouse with its doors, and a lit window with two frames of flicker. Stone is laid in
 * courses of blocks, each a little lighter at its top edge, with a few dark flecks by `hash`.
 */
import type { Colour } from './palette.ts';
import { type Frame, hash, Sheet } from './raster.ts';

/** Stone in courses of `block` by 8 pixels, alternate courses offset by half a block, from (x0, y0) for w by h. */
function stone(f: Frame, x0: number, y0: number, w: number, h: number, block: number, seed: number): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const course = Math.floor(y / 8);
      const across = (x + (course % 2) * (block / 2)) % block;
      let colour: Colour = 'stone';
      if (y % 8 === 0 || across === 0) colour = 'stoneDark';
      else if (y % 8 === 7) colour = 'stoneLight';
      else if (hash(seed, x, y) % 23 === 0) colour = 'stoneDark';
      f.set(x0 + x, y0 + y, colour);
    }
}

/** 64 by 32: four blocks a course, so it tiles across. */
export function wallSheet(): Sheet {
  const sheet = new Sheet(64, 32, 1);
  stone(sheet.frame(0), 0, 0, 64, 32, 16, 1);
  return sheet;
}

/** 64 by 12: a band, and merlons ten wide every sixteen, outlined, so it tiles across. */
export function battlementSheet(): Sheet {
  const sheet = new Sheet(64, 12, 1);
  const f = sheet.frame(0);
  stone(f, 0, 0, 64, 3, 16, 2);
  for (let left = 3; left < 64; left += 16) {
    stone(f, left, 3, 10, 8, 10, 3 + left);
    f.rect(left, 10, 10, 1, 'stoneLight');
  }
  f.outline('ink');
  return sheet;
}

/** 48 by 112: a tower with a ledge, merlons and an arrow slit. */
export function towerSheet(): Sheet {
  const sheet = new Sheet(48, 112, 1);
  const f = sheet.frame(0);
  stone(f, 1, 0, 46, 96, 12, 4);
  f.rect(0, 94, 48, 2, 'stoneLight');
  for (const left of [1, 14, 27, 40]) stone(f, left, 96, 7, 14, 7, 5 + left);
  f.rect(23, 58, 2, 12, 'ink');
  f.outline('ink');
  return sheet;
}

/** 40 by 44: a gatehouse of stone, its arch holding two wooden doors banded with iron. */
export function gateSheet(): Sheet {
  const sheet = new Sheet(40, 44, 1);
  const f = sheet.frame(0);
  stone(f, 0, 0, 40, 44, 10, 6);
  f.rect(0, 42, 40, 2, 'stoneLight');
  for (let y = 0; y < 42; y++)
    for (let x = 6; x < 34; x++) {
      const dx = 2 * x - 39;
      const inside = y < 26 || dx * dx + 4 * (y - 26) * (y - 26) <= 28 * 28;
      if (!inside) continue;
      const edge = x === 6 || x === 33 || x === 19 || x === 20;
      f.set(x, y, edge || (x - 6) % 4 === 3 ? 'ink' : y === 6 || y === 20 ? 'stoneDark' : 'wood');
    }
  return sheet;
}

/** 8 by 12: an arched window lit from within, two frames. */
export function windowSheet(): Sheet {
  const sheet = new Sheet(8, 12, 2);
  for (const n of [0, 1]) {
    const f = sheet.frame(n);
    f.rows(
      0,
      0,
      [
        '..kkkk..',
        '.kggggk.',
        'kggggggk',
        'kggggggk',
        'kggggggk',
        'kggggggk',
        'kggggggk',
        'kggggggk',
        'kggggggk',
        'kffggffk',
        'keffffek',
        'kkkkkkkk',
      ],
      {
        k: 'ink',
        g: 'glow',
        f: 'flame',
        e: 'ember',
      },
    );
    if (n === 1) f.rect(2, 4, 2, 2, 'flame');
  }
  return sheet;
}
