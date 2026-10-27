/**
 * The starter sprites' props (M7.1, D83): a torch on a bracket whose flame has three frames, a bell
 * under its beam, still and swung each way, and a banner with two frames of wind.
 */
import type { Colour } from './palette.ts';
import { Sheet } from './raster.ts';

const FIRE: Readonly<Record<string, Colour>> = { g: 'glow', f: 'flame', e: 'ember' };

/** Three flames, eight pixels across and eight high, the highest row first. */
const FLAMES: readonly (readonly string[])[] = [
  ['...g....', '..fg....', '..fgf...', '.ffggf..', '.fggff..', '.efggf..', '..eggfe.', '...ee...'],
  ['....g...', '....gf..', '...fgf..', '..ffggf.', '..fggff.', '.efggfe.', '..efgge.', '...ee...'],
  ['........', '...g....', '..fgf...', '.fggff..', '.ffggf..', '.efggfe.', '..eggfe.', '...ee...'],
];

export function torchSheet(): Sheet {
  const sheet = new Sheet(8, 16, FLAMES.length);
  FLAMES.forEach((flame, n) => {
    const f = sheet.frame(n);
    f.rect(3, 0, 2, 8, 'wood');
    f.rect(2, 2, 4, 1, 'stoneDark');
    f.rows(0, 8, flame, FIRE);
  });
  return sheet;
}

const BELL = [
  '....ee....',
  '...effe...',
  '..efffge..',
  '..efffge..',
  '..efffge..',
  '.effffgge.',
  '.effffgge.',
  'effffffgge',
  'eeeeeeeeee',
];

/** Still, swung left, swung right: the bell moves two pixels and its clapper one, lagging. */
const SWINGS: readonly { bell: number; clapper: number }[] = [
  { bell: 0, clapper: 0 },
  { bell: -2, clapper: -1 },
  { bell: 2, clapper: 1 },
];

export function bellSheet(): Sheet {
  const sheet = new Sheet(16, 16, SWINGS.length);
  SWINGS.forEach(({ bell, clapper }, n) => {
    const f = sheet.frame(n);
    f.rect(0, 14, 16, 2, 'wood');
    f.rect(7, 12, 2, 2, 'stoneDark');
    f.rows(3 + bell, 3, BELL, FIRE);
    f.rect(7 + clapper, 1, 2, 2, 'stoneDark');
    f.outline('ink');
  });
  return sheet;
}

export function bannerSheet(): Sheet {
  const sheet = new Sheet(12, 20, 2);
  for (const n of [0, 1]) {
    const f = sheet.frame(n);
    f.rect(1, 0, 1, 19, 'wood');
    f.set(1, 19, 'stoneLight');
    for (let x = 2; x <= 9; x++) {
      // The wind: the far half of the cloth a pixel lower in the second frame.
      const drop = n === 1 && x >= 6 ? 1 : 0;
      const notch = x >= 5 && x <= 6 ? 2 : 0;
      f.rect(x, 6 + notch - drop, 1, 12 - notch, 'red');
    }
    f.rect(4, 12, 2, 2, 'glow');
    f.outline('ink');
  }
  return sheet;
}
