/**
 * The designer's moment (M4.5, D55), as its worker's jobs run it, in Node: the project compiled
 * without ui/, so a screen half made stops nothing; loaded to the Play panel's save from a pack
 * with screens, another build; and looked at with a screen's wants, taking no step. And the Play
 * panel's last save kept as each reply lands.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { wantsOf } from '@eb/ui/format';
import { describe, expect, it } from 'vitest';
import { playJobs } from '../play/jobs.ts';
import { noteMoment, playMoment } from '../play/moment.ts';
import type { SentFile } from '../scripts/protocol.ts';

const HUT = resolve(import.meta.dirname, '../../../../tools/cli/test/fixtures/hut');

function hut(): SentFile[] {
  return readdirSync(HUT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(HUT, path).split('\\').join('/'), new Uint8Array(readFileSync(path))] as SentFile;
    });
}

const hutScreen = JSON.parse(readFileSync(join(HUT, 'ui/hut.json'), 'utf8'));
const SAVING = { edition: 'design' };

describe('the designer’s moment', () => {
  it('reads the screen’s facts where the Play panel left the game, no step taken, ui/ half made or not', async () => {
    // The Play panel's game: the hut with its screens, a day rested.
    const play = playJobs();
    await play({ id: 1, kind: 'open-files', files: hut() });
    await play({ id: 2, kind: 'start', seed: '1', saving: { edition: 'playtest' }, at: 1 });
    const stepped = await play({ id: 3, kind: 'act', action: { type: 'hut/rest' }, at: 2 });
    if (stepped.kind !== 'stepped' || !stepped.save) throw new Error(JSON.stringify(stepped));
    noteMoment(stepped);
    expect(playMoment.value?.turn).toBe(1);

    // The designer's: no ui/ at all, so a screen half made is left out with the rest.
    const design = playJobs();
    const opened = await design({ id: 1, kind: 'open-files', files: hut().filter(([p]) => !p.startsWith('ui/')) });
    expect(opened.kind).toBe('opened');
    const loaded = await design({ id: 2, kind: 'load', raw: playMoment.value?.raw ?? '', saving: SAVING, at: 0 });
    expect(loaded).toMatchObject({ kind: 'loaded', ok: true, view: { turn: 1 } });
    const looked = await design({ id: 3, kind: 'look', wants: wantsOf([hutScreen]) });
    if (looked.kind !== 'looked') throw new Error(JSON.stringify(looked));
    expect(looked.view.facts['time.day']).toBe(1);
    expect(looked.view.facts['economy.amount(resource: coins)']).toEqual(expect.any(Number));
    expect(looked.view.conditions['time.day >= 10']).toBe(false);
    expect(looked.view.turn).toBe(1);
    // Looking again with other wants reads them, and still takes no step.
    const again = await design({ id: 4, kind: 'look', wants: { facts: ['time.day'], conditions: [] } });
    expect(again).toMatchObject({ kind: 'looked', view: { turn: 1, facts: { 'time.day': 1 } } });
  });

  it('keeps no moment from a reply without a save, and refuses a look before a game starts', async () => {
    playMoment.value = null;
    noteMoment({ id: 1, kind: 'failed', message: 'no' });
    expect(playMoment.value).toBeNull();
    const design = playJobs();
    await design({ id: 1, kind: 'open-files', files: hut().filter(([path]) => !path.startsWith('ui/')) });
    expect(await design({ id: 2, kind: 'look', wants: { facts: [], conditions: [] } })).toMatchObject({
      kind: 'failed',
    });
  });
});
