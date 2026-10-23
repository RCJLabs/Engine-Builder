/**
 * Above a sound's form (M4.8, D58, docs/specs/audio.md#the-editor): Play, the samples drawn, its
 * length and peak, and three ways to change its voices, each one step of undo: Start from a preset,
 * Vary what is set, and Paste ZzFX as a new voice. The sound renders as the player renders it.
 */
import { notePlayed, peakOf, renderSound, ZZFX_RATE, ZZFX_VOLUME } from '@eb/ui/audio';
import type { Voice } from '@eb/ui/format';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { useForm } from '../forms/formContext.ts';
import { PRESETS, pastedVoice, playable, vary } from './soundEdits.ts';
import '../styles/audio.css';

const MAX_VOICES = 3;
let preview: AudioContext | undefined;

/** Plays samples as the game would, at ZzFX's own level, through the editor's one preview context. */
export function playSamples(samples: Float32Array<ArrayBuffer>, id: string): void {
  if (typeof AudioContext === 'undefined' || samples.length === 0) return;
  preview ??= new AudioContext();
  void preview.resume();
  const buffer = preview.createBuffer(1, samples.length, ZZFX_RATE);
  buffer.copyToChannel(samples, 0);
  const source = preview.createBufferSource();
  source.buffer = buffer;
  const gain = preview.createGain();
  gain.gain.value = ZZFX_VOLUME;
  source.connect(gain).connect(preview.destination);
  source.start();
  notePlayed('sound', id);
}

/** The samples' highs and lows, one column a pixel, in the editor's accent. */
function draw(canvas: HTMLCanvasElement, samples: Float32Array) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(canvas).color;
  const per = Math.max(1, Math.ceil(samples.length / width));
  for (let x = 0; x < width; x++) {
    let [lo, hi] = [0, 0];
    for (let i = x * per; i < Math.min(samples.length, (x + 1) * per); i++) {
      const s = samples[i] as number;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    const top = ((1 - Math.min(1, hi)) * height) / 2;
    const bottom = ((1 - Math.max(-1, lo)) * height) / 2;
    context.fillRect(x, top, 1, Math.max(1, bottom - top));
  }
}

export function SoundPreview({ id, value }: { readonly id: string; readonly value: unknown }) {
  const api = useForm();
  const sound = useMemo(() => playable(value), [value]);
  const samples = useMemo(() => renderSound(sound), [sound]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pasted, setPasted] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const presetId = useUniqueId();
  const pasteId = useUniqueId();
  useEffect(() => {
    if (canvas.current) draw(canvas.current, samples);
  }, [samples]);
  const voices = sound.voices;
  const setVoices = (next: readonly Voice[], said: string) => api.update(['voices'], () => next, said);
  // Vary and Paste work on the voices as the file holds them, so nothing half typed is lost.
  const held = (current: unknown): unknown[] => (Array.isArray(current) ? current : []);
  const seconds = samples.length / ZZFX_RATE;
  return (
    <section class="sound-preview" aria-label="How it sounds">
      <h4>How it sounds</h4>
      <div class="sound-actions">
        <button
          type="button"
          class="button primary"
          disabled={samples.length === 0}
          onClick={() => playSamples(samples, id)}
        >
          Play
        </button>
        <button
          type="button"
          class="button"
          disabled={!api.canEdit || voices.length === 0}
          onClick={() =>
            api.update(
              ['voices'],
              (current) =>
                held(current).map((voice) =>
                  typeof voice === 'object' && voice !== null ? vary(voice as Voice, Math.random) : voice,
                ),
              'Vary the sound',
            )
          }
        >
          Vary
        </button>
      </div>
      {/* The drawing only shows what the note under it says in words. */}
      <div class="sound-wave-box" aria-hidden="true">
        <canvas ref={canvas} class="sound-wave" width={290} height={48} />
      </div>
      <p class="muted sound-note">
        {voices.length === 0
          ? 'No voices yet: start from a preset, or paste ZzFX.'
          : `${seconds.toFixed(2)} s · peak ${(peakOf(samples) * ZZFX_VOLUME).toFixed(2)} as played`}
      </p>
      <div class="sound-field">
        <label for={presetId}>Start from</label>
        <select
          id={presetId}
          class="form-select"
          value=""
          disabled={!api.canEdit}
          onChange={(event) => {
            const name = event.currentTarget.value;
            const make = PRESETS[name];
            if (make) setVoices(make(Math.random), `Start from ${name}`);
          }}
        >
          <option value="">A preset…</option>
          {Object.keys(PRESETS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div class="sound-field">
        <label for={pasteId}>ZzFX</label>
        <input
          id={pasteId}
          class="field form-input"
          value={pasted}
          placeholder="zzfx(...[,,925,.04,.3])"
          spellcheck={false}
          onInput={(event) => setPasted(event.currentTarget.value)}
        />
        <button
          type="button"
          class="button"
          disabled={!api.canEdit || voices.length >= MAX_VOICES || pasted.trim() === ''}
          onClick={() => {
            const voice = pastedVoice(pasted);
            if (typeof voice === 'string') return setProblem(voice);
            setProblem(undefined);
            setPasted('');
            api.update(['voices'], (current) => [...held(current), voice], 'Paste a ZzFX voice');
          }}
        >
          Paste as a new voice
        </button>
        {problem ? (
          <p class="field-problem" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
    </section>
  );
}
