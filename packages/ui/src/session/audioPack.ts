/**
 * A pack's audio as the page plays it (M4.8, D58): its sound, ambience and music records, and the
 * files its music names. The compiler packs a record's conditions as trees; the page keys each
 * layer's and stem's level by its condition's text, which the session reads after every step as
 * it reads a screen's `shows-when`, so each is printed back here with the game's facts.
 */
import { type Condition, type FactCatalog, type Pack, printCondition } from '@eb/core';
import {
  AMBIENCE,
  type AmbienceRecord,
  type AudioPack,
  MUSIC,
  type MusicRecord,
  SOUND,
  type SoundRecord,
} from '../format/audio.ts';

const NO_AUDIO: AudioPack = { sounds: {}, ambience: {}, music: {}, files: {} };

/** A condition as the page keys it: its text, whether the record holds text or a packed tree. */
function whenText(when: unknown, catalog: FactCatalog): string | undefined {
  if (when === undefined) return undefined;
  return typeof when === 'string' ? when : printCondition(when as Condition, catalog);
}

function withWhen<T extends { readonly when?: string }>(item: T, catalog: FactCatalog): T {
  const when = whenText(item.when as unknown, catalog);
  const { when: _packed, ...rest } = item;
  return (when === undefined ? rest : { ...rest, when }) as T;
}

/** The records of a pack's three audio types, and its audio files (format 8). */
export function audioOf(pack: Pack, catalog: FactCatalog): AudioPack {
  const sounds = (pack.records[SOUND] ?? {}) as Readonly<Record<string, SoundRecord>>;
  const ambience = Object.fromEntries(
    Object.entries((pack.records[AMBIENCE] ?? {}) as Readonly<Record<string, AmbienceRecord>>).map(([id, a]) => [
      id,
      {
        ...a,
        layers: a.layers.map((layer) => withWhen(layer, catalog)),
        ...(a['now-and-then'] ? { 'now-and-then': a['now-and-then'].map((then) => withWhen(then, catalog)) } : {}),
      },
    ]),
  );
  const music = Object.fromEntries(
    Object.entries((pack.records[MUSIC] ?? {}) as Readonly<Record<string, MusicRecord>>).map(([id, m]) => [
      id,
      { ...m, stems: m.stems.map((stem) => withWhen(stem, catalog)) },
    ]),
  );
  const files = pack.audio ?? {};
  const none = [sounds, ambience, music, files].every((group) => Object.keys(group).length === 0);
  return none ? NO_AUDIO : { sounds, ambience, music, files };
}
