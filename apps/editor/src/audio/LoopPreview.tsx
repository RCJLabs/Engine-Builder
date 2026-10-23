/**
 * Above an ambience's or a music's form (M4.8, D58, docs/specs/audio.md#the-editor): Play and Stop,
 * through the game's own player, and a box for each layer, sound now and then or stem with a
 * condition, to hear it as if the condition held. A music's files are read from the project as
 * Play is pressed.
 */
import { formatRef } from '@eb/core';
import { AudioPlayer, type Mix } from '@eb/ui/audio';
import {
  type AMBIENCE,
  type AmbienceRecord,
  type AudioPack,
  MUSIC,
  type MusicRecord,
  SOUND,
  type SoundRecord,
} from '@eb/ui/format';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { OpenProject } from '../projects/opened.ts';
import { list, partsOf, previewMix } from './loopParts.ts';
import '../styles/audio.css';

const FULL = { sound: 100, music: 100, ambience: 100, effects: 100, vibration: false } as const;

const base64 = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

/** The pack the preview's player plays from: this record, the project's sounds, and the files it names. */
async function packFor(type: string, id: string, value: unknown, project: OpenProject): Promise<AudioPack> {
  const sounds: Record<string, SoundRecord> = {};
  for (const [key, record] of project.index?.records ?? []) {
    if (key.startsWith(`${SOUND}:`)) sounds[key.slice(SOUND.length + 1)] = record.value as SoundRecord;
  }
  if (type !== MUSIC) return { sounds, ambience: { [id]: value as AmbienceRecord }, music: {}, files: {} };
  const files: Record<string, string> = {};
  for (const stem of list(value, 'stems')) {
    if (typeof stem.asset !== 'string') continue;
    const bytes = await project.source.read(`assets/${stem.asset}`);
    if (bytes) files[stem.asset] = base64(bytes);
  }
  return { sounds, ambience: {}, music: { [id]: value as MusicRecord }, files };
}

export function LoopPreview(props: {
  readonly type: typeof AMBIENCE | typeof MUSIC;
  readonly id: string;
  readonly value: unknown;
  readonly project: OpenProject;
}) {
  const { type, id, value, project } = props;
  const [player, setPlayer] = useState<AudioPlayer | undefined>(undefined);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const parts = useMemo(() => partsOf(type, value), [type, value]);
  const mix = previewMix(type, id, parts, ticked);
  const key = JSON.stringify(mix);
  // Follows the record and the boxes while it plays; stops for good as the form closes.
  useEffect(() => player?.setMix(JSON.parse(key) as Mix), [player, key]);
  useEffect(() => () => player?.dispose(), [player]);
  const play = async () => {
    const next = new AudioPlayer(await packFor(type, id, value, project), {}, FULL);
    next.unlock();
    setPlayer(next);
  };
  const stop = () => {
    player?.dispose();
    setPlayer(undefined);
  };
  const ref = formatRef(type, id);
  return (
    <section class="loop-preview" aria-label="How it plays">
      <h4>How it plays</h4>
      <div class="sound-actions">
        {player ? (
          <button type="button" class="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" class="button primary" disabled={parts.length === 0} onClick={() => void play()}>
            Play
          </button>
        )}
      </div>
      {parts.some((p) => p.when !== undefined) ? (
        <ul class="loop-parts" aria-label={`${ref}’s conditions`}>
          {parts
            .filter((p) => p.when !== undefined)
            .map((p) => (
              <li key={p.key}>
                <label class="loop-part">
                  <input
                    type="checkbox"
                    checked={ticked.has(p.key)}
                    onChange={(event) => {
                      const on = event.currentTarget.checked;
                      setTicked((was) => {
                        const next = new Set(was);
                        if (on) next.add(p.key);
                        else next.delete(p.key);
                        return next;
                      });
                    }}
                  />
                  <span>{`${p.label}, as if “${p.when}” holds`}</span>
                </label>
              </li>
            ))}
        </ul>
      ) : null}
    </section>
  );
}
