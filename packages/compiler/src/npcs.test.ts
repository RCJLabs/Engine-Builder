/**
 * NPCs in the pack (M6.1, D73, docs/specs/npcs.md): an actor placed in a space stands in one place
 * only (E077), and one with a talk and no interact of its own gets the engine's Talk as its use,
 * through prefabs and what a placement overrides.
 */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';

const json = (value: unknown) => JSON.stringify(value);

const TALK = (speaker: string) => ({
  name: speaker,
  speaker,
  starts: [{ line: 'hi' }],
  lines: [{ id: 'hi', text: 'Hi.' }],
});
const RING = [{ effect: 'open-talk', talk: 'bryn' }];

function project(files: Record<string, unknown>) {
  return memorySource({
    'project.json': json({ format: 1, id: 'ford', name: 'Ford', version: '0.1.0', kits: ['stats', 'dialogue'] }),
    'records/speaker/ada.json': json({ name: 'Ada' }),
    'records/speaker/bryn.json': json({ name: 'Bryn' }),
    'records/talk/ada.json': json(TALK('ada')),
    'records/talk/bryn.json': json(TALK('bryn')),
    'records/actor/smith.json': json({ name: 'Ada', talk: 'ada' }),
    'records/actor/ferry.json': json({ name: 'Bryn', talk: 'bryn' }),
    'records/actor/bell.json': json({ name: 'Bell-ringer', talk: 'bryn' }),
    'records/actor/drover.json': json({ name: 'A drover' }),
    ...Object.fromEntries(Object.entries(files).map(([path, value]) => [path, json(value)])),
  });
}

const brief = (diagnostics: readonly { code: string; file?: string; path: string; message: string }[]) =>
  diagnostics.map(({ code, file, path, message }) => ({ code, file, path, message }));

describe('NPCs', () => {
  it('packs a Talk for each actor with a talk and no interact, through prefabs and overrides', async () => {
    const result = await compileProject(
      project({
        'prefabs/stall.json': { name: 'Stall', objects: [{ id: 'keeper', record: 'actor:ferry' }] },
        'spaces/ford.json': {
          name: 'Ford',
          objects: [
            { id: 'smith', record: 'actor:smith' },
            // The prefab's keeper talks as Ada here: its placement overrides the talk.
            { id: 'stall', prefab: 'stall', overrides: { keeper: { overrides: { talk: 'ada' } } } },
            { id: 'bell', record: 'actor:bell', components: { interact: { label: 'Ring', effects: RING } } },
            { id: 'drover', record: 'actor:drover' },
          ],
        },
      }),
      [],
    );
    expect(brief(result.diagnostics)).toEqual([]);
    expect(result.pack?.world?.uses).toEqual({
      ford: {
        smith: { label: 'Talk', effects: [{ effect: 'open-talk', talk: 'ada' }] },
        'stall/keeper': { label: 'Talk', effects: [{ effect: 'open-talk', talk: 'ada' }] },
        bell: { label: 'Ring', effects: RING },
      },
    });
  });

  it('is E077 for an actor placed twice, at the second place’s record, in one space or two', async () => {
    const result = await compileProject(
      project({
        'spaces/ford.json': {
          name: 'Ford',
          objects: [
            { id: 'smith', record: 'actor:smith' },
            { id: 'again', record: 'actor:smith' },
          ],
        },
        'spaces/yard.json': { name: 'Yard', objects: [{ id: 'smith', record: 'actor:smith' }] },
      }),
      [],
    );
    const where = 'it is already at "smith" in spaces/ford.json';
    expect(brief(result.diagnostics)).toEqual([
      { code: 'E077', file: 'spaces/ford.json', path: '/objects/1/record', message: expect.stringContaining(where) },
      { code: 'E077', file: 'spaces/yard.json', path: '/objects/0/record', message: expect.stringContaining(where) },
    ]);
  });

  it('leaves a prefab alone placed nowhere, and a record that isn’t an actor, uncounted', async () => {
    const result = await compileProject(
      project({
        'prefabs/stall.json': { name: 'Stall', objects: [{ id: 'keeper', record: 'actor:ferry' }] },
        'spaces/ford.json': {
          name: 'Ford',
          objects: [
            { id: 'ferry', record: 'actor:ferry' },
            { id: 'a', record: 'speaker:ada' },
            { id: 'b', record: 'speaker:ada' },
          ],
        },
      }),
      [],
    );
    expect(brief(result.diagnostics).filter((d) => d.code === 'E077')).toEqual([]);
  });
});
