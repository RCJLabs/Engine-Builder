/** The loop preview's parts and mix (M4.8): keyed as the game's mix keys them, a condition off until ticked. */
import { mixOf } from '@eb/ui/audio';
import { describe, expect, it } from 'vitest';
import { partsOf, previewMix } from './loopParts.ts';

const ambience = {
  layers: [{ kind: 'noise' }, { kind: 'drone', when: 'time.day >= 4' }, 'x'],
  'now-and-then': [{ sound: 'door', 'every-min': 25, 'every-max': 50 }],
};
const music = {
  stems: [
    { asset: 'audio/a.wav', gain: 0.7 },
    { asset: 'audio/b.wav', when: 'hut.open' },
  ],
};

describe('the loop preview', () => {
  it('lists each part with its key, a half-made one left out', () => {
    expect(partsOf('ambience', ambience)).toEqual([
      { key: 'layer/0', label: 'Layer 1', gain: 1 },
      { key: 'layer/1', label: 'Layer 2', gain: 1, when: 'time.day >= 4' },
      { key: 'then/0', label: 'Now and then 1', gain: 1 },
    ]);
    expect(partsOf('music', music)).toEqual([
      { key: 'stem/0', label: 'Stem 1', gain: 0.7 },
      { key: 'stem/1', label: 'Stem 2', gain: 1, when: 'hut.open' },
    ]);
    expect(partsOf('music', undefined)).toEqual([]);
  });

  it('plays what has no condition, and a condition only while it is ticked, as the game would', () => {
    const parts = partsOf('music', music);
    expect(previewMix('music', 'hut', parts, new Set())).toEqual({
      music: 'hut',
      levels: { 'stem/0': 0.7, 'stem/1': 0 },
    });
    const ticked = previewMix('music', 'hut', parts, new Set(['stem/1']));
    expect(ticked).toEqual({ music: 'hut', levels: { 'stem/0': 0.7, 'stem/1': 1 } });
    // The same levels the game's own mix sets when the condition holds.
    const screen = { id: 'hut', widgets: [], music: 'hut' };
    const game = mixOf(
      [screen as never],
      { 'hut.open': true },
      { sounds: {}, ambience: {}, music: { hut: music as never }, files: {} },
    );
    expect(game.levels).toEqual(ticked.levels);
    expect(previewMix('ambience', 'hut', partsOf('ambience', ambience), new Set())).toEqual({
      ambience: 'hut',
      levels: { 'layer/0': 1, 'layer/1': 0, 'then/0': 1 },
    });
  });
});
