import { WALK_QUALITIES, type WalkQuality } from '../render/spaceHost.ts';

/**
 * The player's settings (M4.3, docs/specs/shell.md#settings): kept per game and edition, outside
 * the saves, so a new game keeps them; read field by field, so a bad one falls back alone (Dirtbag's
 * persist.ts); applied on the shell's root, as Chooser's are.
 */

export const TEXT_SIZES = ['normal', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const MOTIONS = ['device', 'less', 'full'] as const;
export type Motion = (typeof MOTIONS)[number];

/** The player's volumes (M4.8, D58): Sound is the master, Effects the effects and the interface's sounds. */
export const VOLUMES = ['sound', 'music', 'ambience', 'effects'] as const;
export type VolumeName = (typeof VOLUMES)[number];
/** A volume moves in tens from 0 to 100. */
export const VOLUME_STEP = 10;

/** How a space is drawn (M5.8, the editor's tiers of D69): Auto starts from the device's hints. */
export const QUALITIES = WALK_QUALITIES;
export type Quality = WalkQuality;

export interface Settings {
  readonly text: TextSize;
  readonly motion: Motion;
  readonly sound: number;
  readonly music: number;
  readonly ambience: number;
  readonly effects: number;
  readonly vibration: boolean;
  readonly quality: Quality;
  /** The compass and the quest markers over a walked space (M6.6, D78): on unless turned off. */
  readonly markers: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  text: 'normal',
  motion: 'device',
  sound: 80,
  music: 100,
  ambience: 100,
  effects: 100,
  vibration: true,
  quality: 'auto',
  markers: true,
};

const isVolume = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value / VOLUME_STEP) && value >= 0 && value <= 100;

const SCALES: Readonly<Record<TextSize, number>> = { normal: 1, large: 1.2, larger: 1.4 };

export const settingsKey = (game: string, edition: string): string => `eb/${game}/${edition}/settings`;

const one = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;

/** The settings a stored text holds, each field its default when it is missing or wrong. */
export function readSettings(text: string | undefined): Settings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = text === undefined ? {} : JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) stored = parsed as typeof stored;
  } catch {
    // Unreadable: every field takes its default.
  }
  const volume = (name: VolumeName) => (isVolume(stored[name]) ? (stored[name] as number) : DEFAULT_SETTINGS[name]);
  return {
    text: one(TEXT_SIZES, stored.text, DEFAULT_SETTINGS.text),
    motion: one(MOTIONS, stored.motion, DEFAULT_SETTINGS.motion),
    sound: volume('sound'),
    music: volume('music'),
    ambience: volume('ambience'),
    effects: volume('effects'),
    vibration: typeof stored.vibration === 'boolean' ? stored.vibration : DEFAULT_SETTINGS.vibration,
    quality: one(QUALITIES, stored.quality, DEFAULT_SETTINGS.quality),
    markers: typeof stored.markers === 'boolean' ? stored.markers : DEFAULT_SETTINGS.markers,
  };
}

/** What the shell's root carries for them: the text scale, and the motion when it isn't the device's. */
export function settingsAttrs(settings: Settings): {
  readonly style: Readonly<Record<string, string>>;
  readonly 'data-motion'?: 'less' | 'full';
} {
  const style = { '--eb-text-scale': String(SCALES[settings.text]) };
  return settings.motion === 'device' ? { style } : { style, 'data-motion': settings.motion };
}
