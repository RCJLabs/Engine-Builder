/**
 * What plays and how it renders (M4.8, D58, docs/specs/audio.md): the mix from the stack and the
 * view's conditions, one buzz a step, a sound's voices at their offsets, and an ambience layer's
 * loop meeting itself.
 */
import { describe, expect, it } from 'vitest';
import { type AudioPack, zzfxArgs } from '../format/audio.ts';
import type { Screen } from '../format/screen.ts';
import { audioConditions, heaviest, mixOf } from './mix.ts';
import { LOOP_RATE, LOOP_SECONDS, peakOf, renderLayer, renderSound } from './render.ts';
import { buildSamples } from './zzfx.ts';

/** Two renders the same, sample for sample: a yes or no, so a failure doesn't diff 176,400 numbers. */
const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((s, i) => Object.is(s, b[i]));

const audio: AudioPack = {
  sounds: { door: { voices: [{ frequency: 180 }] } },
  ambience: {
    hut: {
      layers: [
        { kind: 'noise', colour: 'brown', frequency: 500, gain: 0.6 },
        { kind: 'noise', colour: 'pink', filter: 'bandpass', frequency: 1800, when: 'flag.on(flag: storm)' },
      ],
      'now-and-then': [{ sound: 'door', 'every-min': 8, 'every-max': 20, when: 'flag.on(flag: night)' }],
    },
    storm: { layers: [{ kind: 'noise', colour: 'white', gain: 0.8 }] },
  },
  music: {
    hut: {
      stems: [
        { asset: 'audio/hut.wav', gain: 0.8 },
        { asset: 'audio/wind.wav', when: 'time.day >= 3' },
      ],
    },
  },
  files: {},
};
const screen = (more: Partial<Screen>): Screen => ({ main: { widget: 'text', text: '' }, ...more });

describe('the mix', () => {
  it('plays what the topmost screen on the stack names, each layer and stem by its condition', () => {
    const stack = [screen({ ambience: 'hut', music: 'hut' }), screen({ title: 'Journal' })];
    expect(mixOf(stack, { 'flag.on(flag: storm)': true, 'time.day >= 3': false }, audio)).toEqual({
      ambience: 'hut',
      music: 'hut',
      levels: { 'layer/0': 1, 'layer/1': 1, 'then/0': 0, 'stem/0': 0.8, 'stem/1': 0 },
    });
    // The storm over the hut takes the ambience; the hut's music plays on beneath it.
    const storm = [...stack, screen({ ambience: 'storm' })];
    expect(mixOf(storm, {}, audio)).toEqual({ ambience: 'storm', music: 'hut', levels: expect.any(Object) });
    expect(mixOf(storm, {}, audio).levels).toEqual({ 'layer/0': 1, 'stem/0': 0.8, 'stem/1': 0 });
  });

  it('reads a condition it doesn’t know as off, and plays nothing that isn’t there', () => {
    const levels = mixOf([screen({ ambience: 'hut' })], { 'flag.on(flag: storm)': null }, audio).levels;
    expect(levels['layer/1']).toBe(0);
    expect(mixOf([screen({ ambience: 'gone', music: 'gone' })], {}, audio)).toEqual({ levels: {} });
    expect(mixOf([], {}, audio)).toEqual({ levels: {} });
  });

  it('lists every condition the audio reads, once, for the session to evaluate', () => {
    expect(audioConditions(audio)).toEqual(['flag.on(flag: night)', 'flag.on(flag: storm)', 'time.day >= 3']);
  });

  it('buzzes the heaviest of a step’s buzzes, and none without one', () => {
    expect(heaviest([{ buzz: 'tap' }, { sound: 'door' }, { buzz: 'thud' }, { buzz: 'knock' }])).toBe('thud');
    expect(heaviest([{ buzz: 'alarm' }, { buzz: 'double' }])).toBe('alarm');
    expect(heaviest([{ sound: 'door' }])).toBeUndefined();
  });
});

describe('rendering', () => {
  it('adds each voice in at its own start, the sound as long as its last voice', () => {
    const first = buildSamples(zzfxArgs({ frequency: 300, release: 0.05 }));
    const second = buildSamples(zzfxArgs({ frequency: 90, release: 0.1 }));
    const sound = renderSound({
      voices: [
        { frequency: 300, release: 0.05 },
        { at: 0.1, frequency: 90, release: 0.1 },
      ],
    });
    const offset = Math.round(0.1 * 44100);
    expect(sound.length).toBe(offset + second.length);
    expect(sound[100]).toBeCloseTo(first[100] as number, 6);
    expect(sound[offset + 100]).toBeCloseTo(second[100] as number, 6);
  });

  it('makes a layer an 8-second loop whose end meets its start, the same noise every time', () => {
    for (const layer of audio.ambience.hut?.layers ?? []) {
      const loop = renderLayer(layer, 'hut/0');
      expect(loop.length).toBe(LOOP_SECONDS * LOOP_RATE);
      expect(same(renderLayer(layer, 'hut/0'), loop)).toBe(true);
      // Across the seam the step is no bigger than the steps inside the loop.
      const steps = Array.from({ length: 2000 }, (_, i) => Math.abs((loop[i + 1] as number) - (loop[i] as number)));
      const seam = Math.abs((loop[0] as number) - (loop.at(-1) as number));
      expect(seam).toBeLessThanOrEqual(Math.max(...steps) * 1.5);
      expect(peakOf(loop)).toBeLessThan(1);
    }
    expect(same(renderLayer({ kind: 'noise' }, 'a/0'), renderLayer({ kind: 'noise' }, 'b/0'))).toBe(false);
  });

  it('fits a drone’s pitch to whole cycles in the loop, so it meets itself', () => {
    const loop = renderLayer({ kind: 'drone', frequency: 110.3, gain: 1 }, 'x/0');
    expect(Math.abs((loop[0] as number) - (loop.at(-1) as number))).toBeLessThan(0.02);
    // The seam's crossfade hides a drone that doesn't fit, but not the dip where its two ends,
    // out of step, cancel: a fitted drone is as loud across the seam as in the middle.
    const peakAt = (from: number) =>
      peakOf(loop.subarray(Math.round(from * LOOP_RATE), Math.round((from + 0.05) * LOOP_RATE)));
    expect(peakAt(0.1)).toBeGreaterThan(peakAt(4) * 0.95);
  });

  it('filters a noise low-pass when its record says no filter', () => {
    const noise = { kind: 'noise', frequency: 300 } as const;
    expect(same(renderLayer(noise, 'x/0'), renderLayer({ ...noise, filter: 'lowpass' }, 'x/0'))).toBe(true);
    expect(same(renderLayer(noise, 'x/0'), renderLayer({ ...noise, filter: 'none' }, 'x/0'))).toBe(false);
  });
});
