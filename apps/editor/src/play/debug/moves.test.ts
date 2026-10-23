/**
 * Step back holds the run to its recorded hashes (M4.9): a step that reaches another state when
 * played again stops it, naming the step, rather than putting a state in play that never was.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { openPack } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import type { SentFile } from '../../scripts/protocol.ts';
import { packFiles } from '../jobs.ts';
import { playTo, stepBack } from './moves.ts';
import { newRecording, recorded } from './recording.ts';
import { stepOf } from './steps.ts';

const HUT = resolve(import.meta.dirname, '../../../../../tools/cli/test/fixtures/hut');

async function hutOpened() {
  const files = readdirSync(HUT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(HUT, path).split('\\').join('/'), new Uint8Array(readFileSync(path))] as SentFile;
    });
  const packed = await packFiles(0, files);
  if (!('ok' in packed)) throw new Error('The hut has errors');
  const opened = openPack(packed.pack, { debug: true });
  if (!opened.ok) throw new Error(opened.message);
  return opened.opened;
}

describe('the recording walked back', () => {
  it('plays the run again to the step before, and stops at a step whose hash it doesn’t reach', async () => {
    const opened = await hutOpened();
    const { game, sim } = opened.setup;
    let state = game.init('1', sim);
    let recording = newRecording(state);
    for (const type of ['hut/carry', 'hut/rest', 'hut/carry']) {
      const step = game.reduce(state, { type }, sim);
      state = step.state;
      recording = recorded(recording, stepOf(opened, { type }, state, step.beats));
    }
    const back = stepBack(opened, recording);
    if (!back.ok) throw new Error(back.reason);
    expect(back.recording.cursor).toBe(2);
    expect(game.fact(back.state, 'time.day', undefined, sim)).toBe(2);

    const tampered = { ...recording, steps: recording.steps.map((s, i) => (i === 1 ? { ...s, hash: 'x' } : s)) };
    expect(() => playTo(opened, tampered, 3)).toThrow(/doesn’t play the same twice: step 2 \(Rest\)/);
    expect(stepBack(opened, { ...recording, cursor: 0 })).toEqual({
      ok: false,
      reason: 'There is no step before this one in the recording',
    });
  });
});
