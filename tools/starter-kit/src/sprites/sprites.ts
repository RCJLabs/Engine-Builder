/**
 * The starter sprites' files (M7.1, D83, docs/specs/2d-scenes.md#the-starter-sprite-kit), as a
 * project folder: each sheet a PNG under assets/starter-sprites/, its sprite record with its frame,
 * origin and clips, and the provenance log that says they are RCJLabs's, dedicated to CC0. Since
 * M7.2 the deck's tileset too (tiles.ts), its sheet beside the sprites'; since M7.3 the keep's rooms
 * (rooms.ts), each a sprite and a room record, and a ladder for stairs.
 */
import type { SpriteClip, SpriteRecord } from '@eb/schema';
import { FIGURE_CLIPS, figureSheet, LOOKS } from './figures.ts';
import { battlementSheet, gateSheet, towerSheet, wallSheet, windowSheet } from './keep.ts';
import { bannerSheet, bellSheet, torchSheet } from './props.ts';
import type { Sheet } from './raster.ts';
import { ladderSheet, ROOMS, roomSheet } from './rooms.ts';
import { moonSheet, ridgeFarSheet, ridgeNearSheet, skySheet, starsSheet } from './sky.ts';
import { deckSheet, deckTileset } from './tiles.ts';

export interface SpriteFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export const SPRITES_FOLDER = 'starter-sprites';
export const SPRITES_DATE = '2026-10-27';

interface Made {
  readonly id: string;
  readonly name: string;
  readonly sheet: () => Sheet;
  readonly clips: Readonly<Record<string, SpriteClip>>;
}

const STILL = { still: { frames: [0, 0] as [number, number], fps: 1 } };

/** Every sprite, in the order a listing shows them: figures, props, the keep, the night. */
export const MADE: readonly Made[] = [
  ...Object.entries(LOOKS).map(([who, look]) => ({
    id: `figure-${who}`,
    name: `Figure (${who})`,
    sheet: () => figureSheet(look),
    clips: FIGURE_CLIPS,
  })),
  { id: 'torch', name: 'Torch', sheet: torchSheet, clips: { burn: { frames: [0, 2], fps: 9 } } },
  { id: 'bell', name: 'Bell', sheet: bellSheet, clips: { ...STILL, ring: { frames: [1, 2], fps: 6 } } },
  { id: 'banner', name: 'Banner', sheet: bannerSheet, clips: { wave: { frames: [0, 1], fps: 3 } } },
  { id: 'keep-wall', name: 'Keep wall', sheet: wallSheet, clips: STILL },
  { id: 'keep-battlement', name: 'Keep battlement', sheet: battlementSheet, clips: STILL },
  { id: 'keep-tower', name: 'Keep tower', sheet: towerSheet, clips: STILL },
  { id: 'keep-gate', name: 'Keep gate', sheet: gateSheet, clips: STILL },
  { id: 'keep-window', name: 'Lit window', sheet: windowSheet, clips: { lit: { frames: [0, 1], fps: 3 } } },
  { id: 'sky-night', name: 'Night sky', sheet: skySheet, clips: STILL },
  { id: 'sky-stars', name: 'Stars', sheet: starsSheet, clips: { twinkle: { frames: [0, 1], fps: 1 } } },
  { id: 'sky-moon', name: 'Moon', sheet: moonSheet, clips: STILL },
  { id: 'ridge-far', name: 'Far ridge', sheet: ridgeFarSheet, clips: STILL },
  { id: 'ridge-near', name: 'Near ridge', sheet: ridgeNearSheet, clips: STILL },
  // M7.3: the keep's rooms, and the ladder its stairs are drawn with.
  ...Object.entries(ROOMS).map(([id, art]) => ({
    id: `room-${id}`,
    name: art.name,
    sheet: () => roomSheet(art),
    clips: art.frames === 2 ? { flicker: { frames: [0, 1] as [number, number], fps: 4 } } : STILL,
  })),
  { id: 'ladder', name: 'Ladder', sheet: ladderSheet, clips: STILL },
];

/** The tilesets (M7.2), by id: each sheet's file is `<id>-tiles.png`. */
export const TILESETS = { deck: deckSheet } as const;
export const tilesetSheet = (id: string) => `${SPRITES_FOLDER}/${id}-tiles.png`;

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

/** Every file of the starter sprites, sorted by path. */
export function makeSprites(): SpriteFile[] {
  const files: SpriteFile[] = [];
  for (const made of MADE) {
    const sheet = made.sheet();
    const record: SpriteRecord = {
      name: made.name,
      sheet: `${SPRITES_FOLDER}/${made.id}.png`,
      frame: [sheet.frameWidth, sheet.frameHeight],
      clips: made.clips,
    };
    files.push({ path: `assets/${SPRITES_FOLDER}/${made.id}.png`, bytes: sheet.png() });
    files.push({ path: `records/sprite/${made.id}.json`, bytes: json(record) });
  }
  for (const [id, sheet] of Object.entries(TILESETS)) {
    files.push({ path: `assets/${tilesetSheet(id)}`, bytes: sheet().png() });
    files.push({ path: `records/tileset/${id}.json`, bytes: json(deckTileset(tilesetSheet(id))) });
  }
  for (const [id, art] of Object.entries(ROOMS))
    files.push({ path: `records/room/${id}.json`, bytes: json({ name: art.name, sprite: `room-${id}` }) });
  const entry = {
    licence: 'CC0-1.0',
    author: 'RCJLabs',
    source: 'Drawn in code by RCJLabs for Engine-Builder, dedicated to the public domain',
    date: SPRITES_DATE,
    tool: 'tools/starter-kit (sprites)',
  };
  const sheets = [
    ...MADE.map((made) => `${SPRITES_FOLDER}/${made.id}.png`),
    ...Object.keys(TILESETS).map(tilesetSheet),
  ];
  const log = Object.fromEntries(sheets.map((sheet) => [sheet, entry]));
  files.push({ path: 'assets/assets.json', bytes: json({ files: log }) });
  files.push({
    path: 'project.json',
    bytes: json({ format: 1, id: 'starter-sprites', name: 'Starter sprites', version: '1.0.0' }),
  });
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
