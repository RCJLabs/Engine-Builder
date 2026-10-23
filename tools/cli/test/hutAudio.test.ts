/**
 * The hut's audio (M4.8's gate in Node, D58): its pack carries its music's file as format 8; every
 * sound and every ambience layer renders to the samples it rendered when this was written, none
 * clipping as it plays; and played in the worker's host as the page plays it, a carried load's step brings the
 * load's sound and a knock, while the mix plays the hut's wind and music on its screen, the storm's
 * wind over it, and the rising wind's layer only from day 4.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { mixOf, peakOf, renderLayer, renderSound, ZZFX_VOLUME } from '@eb/ui/audio';
import type { AudioPack, Screen } from '@eb/ui/format';
import { type PlayReply, playHost } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const HUT = resolve(import.meta.dirname, 'fixtures/hut');

const hashOf = (samples: Float32Array) =>
  createHash('sha256').update(new Uint8Array(samples.buffer)).digest('hex').slice(0, 16);

/** What each of the hut's sounds and layers rendered to when the gate was written. */
const RENDERED: Readonly<Record<string, string>> = {
  'sound:chime': 'dd1ea121cdc0c17c',
  'sound:click': '52d6155275acf0dc',
  'sound:coin': '945503d550d99232',
  'sound:door': 'e46ca48d97b48668',
  'sound:load': '8355386b3f411d8c',
  'ambience:hut/0': '4bda1a60ff511b5d',
  'ambience:hut/1': 'a9bba9efd58db9f5',
  'ambience:storm/0': 'd6c41747a7475260',
  'ambience:storm/1': '0c20a707acbefc2e',
  'ambience:storm/2': 'fb01e8061095e929',
};

async function opened() {
  const compiled = await compileWithGame(folderSource(HUT));
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const pack = JSON.parse(JSON.stringify(compiled.pack)) as { format: number; audio: Record<string, string> };
  const host = playHost();
  const reply = host({ id: 0, kind: 'open', pack });
  if (reply.kind !== 'opened') throw new Error(`The hut didn't open: ${JSON.stringify(reply)}`);
  return { pack, host, reply };
}

describe('the hut’s audio', () => {
  it('packs its music’s file as format 8, byte for byte', async () => {
    const { pack, reply } = await opened();
    expect(pack.format).toBe(8);
    const wav = readFileSync(resolve(HUT, 'assets/audio/hut-theme.wav'));
    expect(Buffer.from(pack.audio['audio/hut-theme.wav'] as string, 'base64').equals(wav)).toBe(true);
    expect(Object.keys(reply.audio.sounds).sort()).toEqual(['chime', 'click', 'coin', 'door', 'load']);
    expect(reply.audio.files).toEqual(pack.audio);
  });

  it('renders each sound and layer to the samples it rendered when this was written, under full scale', async () => {
    const { reply } = await opened();
    const { sounds, ambience } = reply.audio;
    const rendered: Record<string, string> = {};
    for (const [id, sound] of Object.entries(sounds)) {
      const samples = renderSound(sound);
      // Played at ZzFX's own 0.3, as the player plays every sound: alone at full volume, it doesn't clip.
      expect(peakOf(samples) * ZZFX_VOLUME, id).toBeLessThan(1);
      rendered[`sound:${id}`] = hashOf(samples);
    }
    for (const [id, a] of Object.entries(ambience)) {
      for (const [n, layer] of a.layers.entries()) {
        const samples = renderLayer(layer, `${id}/${n}`);
        expect(peakOf(samples), `${id}/${n}`).toBeLessThan(1);
        rendered[`ambience:${id}/${n}`] = hashOf(samples);
      }
    }
    expect(rendered).toEqual(RENDERED);
  });

  it('sends a carried load’s sound and buzz with the step, and the mix follows the screens and the day', async () => {
    const { host, reply } = await opened();
    const audio: AudioPack = reply.audio;
    const screens = reply.screens as Readonly<Record<string, Screen>>;
    let step: PlayReply = host({ id: 1, kind: 'start', seed: 'audio', saving: { edition: 'test' }, at: 0 });
    if (step.kind !== 'started') throw new Error('No game');
    expect(mixOf([screens.hut as Screen], step.view.conditions, audio)).toEqual({
      ambience: 'hut',
      music: 'hut',
      levels: { 'layer/0': 1, 'layer/1': 0, 'then/0': 1, 'stem/0': 0.7 },
    });
    // The storm's screen over the hut's takes the ambience; the music plays on.
    expect(mixOf([screens.hut as Screen, screens.storm as Screen], step.view.conditions, audio)).toMatchObject({
      ambience: 'storm',
      music: 'hut',
    });
    let carried = false;
    for (let n = 2; n < 40 && !(carried && step.view.conditions['time.day >= 4'] === true); n++) {
      const carry = step.view.offered.find((a) => a.type === 'hut/carry') ?? step.view.offered[0];
      if (!carry) break;
      step = host({ id: n, kind: 'act', action: carry, at: n });
      if (step.kind !== 'stepped') throw new Error(`The step failed: ${JSON.stringify(step)}`);
      if (carry.type === 'hut/carry') {
        expect(step.cues).toContainEqual({ sound: 'load', buzz: 'knock' });
        carried = true;
      }
    }
    expect(carried).toBe(true);
    // From day 4 the wind rises.
    expect(mixOf([screens.hut as Screen], step.view.conditions, audio).levels['layer/1']).toBe(1);
  });
});
