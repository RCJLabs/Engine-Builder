/**
 * The engine's sprite type (M7.1, D83, docs/specs/2d-scenes.md#sprites): a picture for a 2D space,
 * cut from a PNG sheet under assets/ into frames of one size, numbered across and then down from 0,
 * and its clips, runs of those frames played at a rate. The rules a type file can't say are E091's
 * here (a clip running backwards, the clip played by default not among the clips); the compiler
 * reads the sheet's header for the rest (sprites.ts in @eb/compiler).
 */
import type { Report } from './checkValue.ts';
import type { FieldDef, TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

export const SPRITE = 'sprite';

/** The fastest a clip plays, in frames a second. */
export const FPS_MOST = 60;

export interface SpriteClip {
  /** The first and last frame it plays, both included. */
  readonly frames: readonly [number, number];
  readonly fps: number;
  /** False holds the last frame; it loops when left out. */
  readonly loop?: boolean;
}

/** A sprite record as its file holds it. */
export interface SpriteRecord {
  readonly name?: string;
  readonly sheet: string;
  readonly frame: readonly [number, number];
  readonly origin?: readonly [number, number];
  readonly clips: Readonly<Record<string, SpriteClip>>;
  readonly clip?: string;
}

const pair = (label: string, least: number, description: string, optional = false): FieldDef => ({
  kind: 'list',
  of: { kind: 'int', min: least },
  min: 2,
  max: 2,
  optional,
  label,
  description,
});

export const SPRITE_TYPE_FILE: TypeFile = {
  title: 'Sprite',
  description: 'A picture for a 2D space: a PNG sheet cut into frames, and its clips (docs/specs/2d-scenes.md).',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    sheet: { kind: 'asset', of: 'image', label: 'Sheet', description: 'A .png under assets/, its frames side by side' },
    frame: pair('Frame', 1, 'Each frame’s width and height in pixels'),
    origin: pair(
      'Origin',
      0,
      'The frame’s pixel that stands where the object is placed, across from the left and up from the bottom: its bottom centre when left out',
      true,
    ),
    clips: {
      kind: 'map',
      label: 'Clips',
      description: 'Runs of frames, each played at its rate',
      of: {
        kind: 'group',
        fields: {
          frames: pair('Frames', 0, 'The first and the last frame it plays, counted across and then down from 0'),
          fps: { kind: 'number', min: 0.1, max: FPS_MOST, label: 'Rate', description: 'Frames a second' },
          loop: { kind: 'bool', optional: true, label: 'Loops', description: 'Off, it holds its last frame' },
        },
      },
    },
    clip: {
      kind: 'text',
      min: 1,
      optional: true,
      label: 'Plays',
      description: 'The clip played when nothing names one: the first when left out',
    },
  },
};

export const SPRITE_DATA: DataType = typeFromFile(SPRITE, SPRITE_TYPE_FILE);

/** The clip a sprite plays when nothing names one: its own `clip`, else its first. */
export const defaultClipOf = (record: SpriteRecord): string | undefined => record.clip ?? Object.keys(record.clips)[0];

/** A sprite record that passed its schema: clips that run forward (E091), and a default clip it has. */
export function checkSprite(record: SpriteRecord, report: Report): void {
  const names = Object.keys(record.clips);
  if (names.length === 0) report('E091', '/clips', 'A sprite has at least one clip');
  for (const [name, clip] of Object.entries(record.clips)) {
    const [first, last] = clip.frames;
    if (last < first) report('E091', `/clips/${name}/frames`, `It runs backwards, from frame ${first} to ${last}`);
  }
  if (record.clip !== undefined && !names.includes(record.clip))
    report(
      'E091',
      '/clip',
      `It has no clip “${record.clip}”: it has ${names.map((n) => `“${n}”`).join(', ') || 'none'}`,
    );
  const [w, h] = record.frame;
  const [x, y] = record.origin ?? [0, 0];
  if (x >= w || y >= h) report('E091', '/origin', `The origin is outside the ${w} by ${h} frame`);
}
