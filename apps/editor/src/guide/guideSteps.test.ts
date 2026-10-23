import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { projectFromTemplate } from '../projects/templates.ts';
import { guideProblems } from './guideChecks.ts';
import { readGuide, stepPlace } from './guideSteps.ts';

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
    expect(await guideProblems(memorySource({ 'guide.json': '{ nope' }))).toMatchObject([{ code: 'E007' }]);
  });
});
