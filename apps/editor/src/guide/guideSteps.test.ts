import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { projectProblems, tally } from '../problems/collect.ts';
import { placeOf } from '../problems/problemList.ts';
import { projectFromTemplate } from '../projects/templates.ts';
import { EMPTY_INDEX } from '../records/recordIndex.ts';
import { guideProblems } from './guideChecks.ts';
import { guideMoved, readGuide, stepPlace } from './guideSteps.ts';

const GUIDE = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../templates/salvage-coast/guide.json'), 'utf8'),
) as unknown;

async function salvageCoast() {
  const files = await projectFromTemplate('salvage-coast', 'Grey Sound');
  const source = memorySource(Object.fromEntries(files));
  return { source, catalog: await readCatalog(source) };
}

describe('Make it yours', () => {
  it('reads the steps with their title, and none from a guide of the wrong shape', () => {
    const guide = readGuide(GUIDE);
    expect(guide?.title).toBe('Make it yours');
    expect(guide?.steps.map((s) => s.id)).toEqual([
      'name',
      'debt',
      'wrecks',
      'coast',
      'raiders',
      'contract',
      'voyages',
      'colours',
      'play',
      'export',
    ]);
    expect(readGuide({ steps: [] })).toBeNull();
    expect(readGuide({ steps: [{ id: 'a', title: 'A', text: 'B', open: { panel: 'play' } }] })?.title).toBe(
      'Make it yours',
    );
  });

  it('opens each step where a problem in its file would open', async () => {
    const { catalog } = await salvageCoast();
    const guide = readGuide(GUIDE);
    const places = Object.fromEntries((guide?.steps ?? []).map((step) => [step.id, stepPlace(step, catalog)]));
    expect(places).toEqual({
      name: { kind: 'panel', panel: 'project' },
      debt: { kind: 'record', type: 'resource', id: 'debt', at: '/start' },
      wrecks: { kind: 'record', type: 'deck', id: 'wrecks', at: '/events' },
      coast: { kind: 'record', type: 'map', id: 'coast', at: '/layers' },
      raiders: { kind: 'record', type: 'actor', id: 'raider', at: '/stats' },
      contract: { kind: 'record', type: 'quest', id: 'survey', at: '/stages/2/effects' },
      voyages: { kind: 'script', id: 'harbour' },
      colours: { kind: 'ui', path: 'ui/theme.json' },
      play: { kind: 'panel', panel: 'play' },
      export: { kind: 'panel', panel: 'project' },
    });
  });

  it('opens a space’s step in the Scene panel, at the object it points into (M6.9)', async () => {
    const { catalog } = await salvageCoast();
    const step = {
      id: 'camp',
      title: 'Camp',
      text: 'Move it.',
      open: { file: 'spaces/green.json', at: '/objects/3/at' },
    };
    expect(stepPlace(step, catalog)).toEqual({ kind: 'space', path: 'spaces/green.json', object: 3 });
  });

  it('has no place for a file the editor can’t open', async () => {
    const { catalog } = await salvageCoast();
    const step = { id: 'notes', title: 'Notes', text: 'Read them.', open: { file: 'NOTES.txt' } };
    expect(stepPlace(step, catalog)).toBeNull();
  });

  it('lists in Problems what eb validate says of guide.json', async () => {
    const { source } = await salvageCoast();
    expect(await guideProblems(source)).toEqual([]);
    const broken = memorySource({
      'project.json': '{ "format": 1, "id": "g", "name": "G", "version": "0.1.0" }',
      'guide.json': JSON.stringify({
        steps: [{ id: 'gone', title: 'Gone', text: 'It went.', open: { file: 'records/item/gone.json' } }],
      }),
    });
    const editor = (await guideProblems(broken)).map((d) => `${d.code} ${d.path}`);
    const compiled = (await compileProject(broken, [])).diagnostics.map((d) => `${d.code} ${d.path}`);
    expect(editor).toEqual(['W140 /steps/0/open/file']);
    expect(compiled).toEqual(editor);
    // Listed with the project's other problems, counted on the tab, and opened in the Project panel.
    const catalog = await readCatalog(broken);
    const guide = await guideProblems(broken);
    const index = { ...EMPTY_INDEX, guide };
    expect(projectProblems(catalog, index)).toEqual(guide);
    expect(tally(catalog, index)).toEqual({ errors: 0, warnings: 1 });
    expect(placeOf(guide[0] as (typeof guide)[number], catalog)).toEqual({ kind: 'panel', panel: 'project' });
    expect(await guideProblems(memorySource({ 'guide.json': '{ nope' }))).toMatchObject([{ code: 'E007' }]);
  });

  it('follows a record renamed: each step that opens its file opens where it went, the rest as they were', () => {
    const guide = {
      title: 'Make it yours',
      steps: [
        { id: 'raiders', title: 'T', text: 'X', open: { file: 'records/actor/raider.json', at: '/stats' } },
        { id: 'play', title: 'P', text: 'Y', open: { panel: 'play' } },
      ],
    };
    const moved = guideMoved(guide, 'records/actor/raider.json', 'records/actor/corsair.json') as typeof guide;
    expect(moved.steps[0]?.open).toEqual({ file: 'records/actor/corsair.json', at: '/stats' });
    expect(moved.steps[1]).toBe(guide.steps[1]);
    expect(guideMoved(guide, 'records/actor/boat.json', 'records/actor/ketch.json')).toBe(guide);
    expect(guideMoved('not a guide', 'a', 'b')).toBe('not a guide');
  });
});
