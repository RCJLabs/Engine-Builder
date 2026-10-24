import { compileProject, memorySource } from '@eb/compiler';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { pngOf } from '../../../../packages/compiler/test/png.ts';
import { readCatalog } from '../forms/catalog.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { NO_SCRIPTS } from '../scripts/gameState.ts';
import { spaceProblems } from '../spaces/spaceChecks.ts';
import { badgeText, countProblems, countsText, projectProblems, tally } from './collect.ts';
import { ALL_PROBLEMS, fileTitle, groupProblems, placeOf, shownGroups, whereOf } from './problemList.ts';

const ludus = () => readFixture(FIXTURE_LUDUS);
const json = (value: unknown) => JSON.stringify(value, null, 2);
const spiculus = () => JSON.parse(ludus()['records/gladiator/spiculus.json'] as string);
const own = { licence: 'own', source: 'Drawn', date: '2026-10-18' };

/** The ludus fixture broken every way the compiler can tell, each file once. */
function broken(): Record<string, string | Uint8Array> {
  return {
    ...ludus(),
    'project.json': json({ ...JSON.parse(ludus()['project.json'] as string), version: 'one' }),
    'types/beast.json': json({ title: 'Beast', fields: { name: { kind: 'text', min: 'one' } } }),
    'records/beast/lion.json': json({ name: 'Lion' }),
    'types/chariot.json': json({ title: 'Chariot', fields: { team: { kind: 'ref', to: 'stable' } } }),
    'types/notes.txt': 'not a type',
    'records/gladiator/spiculus.json': json({ ...spiculus(), might: 140, school: 'nowhere', portrait: 'gone.png' }),
    'records/gladiator/flamma.json': '{ "name": ',
    'records/stray.json': '{}',
    'records/gladiator/notes.txt': 'notes',
    'records/gladiator/crixus.json': json({ ...spiculus(), name: 'Crixus', fights: 'arena.day and (' }),
    'assets/ui/button.png': 'png',
    'assets/ui/badge.png': 'png',
    'assets/stand-ins/x.svg': '<svg/>',
    // M5.1: a space whose second object takes the first's id, places a missing prefab and has a bad scale.
    'spaces/yard.json': json({
      name: 'Yard',
      objects: [
        { id: 'box', shape: 'box' },
        { id: 'box', prefab: 'barrel' },
      ],
    }),
    'spaces/shed.json': json({ name: 'Shed', objects: [{ id: 'roof', shape: 'box', scale: [1, 0, 1] }] }),
    'spaces/broken.json': '{ "name": ',
    'spaces/old/yard.json': '{}',
    'prefabs/crate.json': json({ name: 'Crate', objects: [{ id: 'me', prefab: 'crate' }] }),
    // M5.2: a component of no kind and one that doesn't fit, a record placed that isn't there and one
    // whose override doesn't fit, an override of an object the prefab lacks, two starts, and the
    // component kinds' own: one of the engine's name taken, one not a type file, a note.
    'spaces/court.json': json({
      name: 'Court',
      objects: [
        { id: 'a', shape: 'box', components: { glow: {}, light: { range: 0 } } },
        { id: 'b', record: 'gladiator:nobody' },
        { id: 'c', record: 'gladiator:spiculus', overrides: { might: 'strong' } },
        { id: 'd', prefab: 'lamp', overrides: { shade: {} } },
        { id: 'e', shape: 'box', components: { spawn: { start: true } } },
        { id: 'f', shape: 'box', components: { spawn: { start: true } } },
      ],
    }),
    'prefabs/lamp.json': json({ name: 'Lamp', objects: [{ id: 'bulb', shape: 'sphere' }] }),
    'components/light.json': json({ title: 'Light', fields: {} }),
    'components/hold.json': json({ title: 'Hold', fields: { grade: { kind: 'grade' } } }),
    'components/notes.md': 'notes',
    // M5.3: a terrain whose heights are 8-bit and whose paint is missing, water on a box, and heights
    // with no space.
    'spaces/fell.json': json({
      name: 'Fell',
      terrain: { size: 65, spacing: 1, low: 0, high: 10, layers: [{ name: 'Grass', color: '#5f8f3e' }] },
      objects: [{ id: 'tank', shape: 'box', components: { water: {} } }],
    }),
    'spaces/fell.heights.png': pngOf(65, 65, 8, 0),
    'spaces/moor.heights.png': pngOf(65, 65, 16, 0),
    'assets/assets.json': json({
      files: {
        'portraits/spiculus.svg': { ...own, licence: 'CC-BY-NC-4.0' },
        'ui/badge.png': { ...own, date: '2026-02-30' },
        'stand-ins/x.svg': { ...own, standIn: true },
        'gone.svg': own,
      },
    }),
  };
}

async function both(files: Record<string, string | Uint8Array>) {
  const source = memorySource(files);
  const catalog = await readCatalog(source);
  const read = await updateIndex(EMPTY_INDEX, source, catalog, null);
  // The spaces' checks that read records follow the index, as the editor runs them (projects/opened.ts).
  const index = { ...read, spaces: (await spaceProblems(source, catalog, read, NO_SCRIPTS)).problems };
  return {
    catalog,
    index,
    editor: projectProblems(catalog, index),
    compiler: (await compileProject(source, [])).diagnostics,
  };
}

describe('the project’s problems', () => {
  it('are the compiler’s, every kind of file broken at once', async () => {
    const { editor, compiler } = await both(broken());
    expect(editor).toEqual(compiler);
    // Every code that can come from data alone, so the test above holds each kind together.
    expect([...new Set(compiler.map((d) => d.code))].sort()).toEqual([
      'E001',
      'E005',
      'E007',
      'E008',
      'E010',
      'E011',
      'E015',
      'E016',
      'E017',
      'E018',
      'E019',
      'E020',
      'E021',
      'E058',
      'E059',
      'E060',
      'E061',
      'E062',
      'E063',
      'E064',
      'E065',
      'E066',
      'E067',
      'W101',
      'W105',
      'W106',
      'W107',
      'W141',
      'W142',
      'W143',
      'W144',
      'W145',
    ]);
  });

  it('are the compiler’s for a clean project: none', async () => {
    const { editor, compiler } = await both(ludus());
    expect(compiler).toEqual([]);
    expect(editor).toEqual([]);
  });

  it('are the compiler’s whichever files are broken (property, 40 runs)', async () => {
    const breaks = Object.entries(broken()).filter(([path, text]) => ludus()[path] !== text);
    await fc.assert(
      fc.asyncProperty(fc.subarray(breaks), async (chosen) => {
        const { editor, compiler } = await both({ ...ludus(), ...Object.fromEntries(chosen) });
        expect(editor).toEqual(compiler);
      }),
      { numRuns: 40 },
    );
  });

  it('show the files’ own until the records are read', async () => {
    const source = memorySource(broken());
    const catalog = await readCatalog(source);
    const first = projectProblems(catalog, null);
    expect(first.some((d) => d.code === 'E008')).toBe(true);
    expect(first.some((d) => d.code === 'E001')).toBe(false);
  });
});

describe('where each problem is fixed', () => {
  it('opens a record at its field, a type, an asset, the panels, or nothing for a misplaced file', async () => {
    const { catalog, editor } = await both(broken());
    const placed = (code: string, file?: string) =>
      placeOf(editor.find((d) => d.code === code && (file === undefined || d.file === file)) as never, catalog);
    expect(placed('E001')).toEqual({ kind: 'record', type: 'gladiator', id: 'spiculus', at: '/might' });
    expect(placed('E007', 'records/gladiator/flamma.json')).toEqual({
      kind: 'record',
      type: 'gladiator',
      id: 'flamma',
      at: '',
    });
    expect(placed('E015', 'types/beast.json')).toEqual({ kind: 'type', type: 'beast' });
    // A terrain's PNG opens its space (M5.3), and is listed under it.
    expect(placed('E067', 'spaces/fell.heights.png')).toEqual({ kind: 'space', path: 'spaces/fell.json' });
    expect(fileTitle('spaces/fell.heights.png', catalog, null)).toBe("Space fell: the terrain's heights");
    // A component kind's opens it in the designer (M5.2); one named as an engine kind is, nowhere else.
    expect(placed('E015', 'components/hold.json')).toEqual({ kind: 'component', id: 'hold' });
    expect(placed('E063')).toEqual({ kind: 'space', path: 'spaces/court.json', object: 0 });
    expect(placed('E066')).toEqual({ kind: 'space', path: 'spaces/court.json', object: 3 });
    expect(placed('E008')).toEqual({ kind: 'panel', panel: 'project' });
    expect(placed('E019')).toEqual({ kind: 'asset', path: 'ui/button.png' });
    expect(placed('E020')).toEqual({ kind: 'asset', path: 'portraits/spiculus.svg' });
    expect(placed('W106')).toEqual({ kind: 'panel', panel: 'assets' });
    expect(placed('E010')).toBeNull();
    expect(placed('W105')).toBeNull();
    // A space's problem opens it with its object chosen (M5.1); a misplaced one, nowhere.
    expect(placed('E058')).toEqual({ kind: 'space', path: 'spaces/shed.json', object: 0 });
    expect(placed('E059')).toEqual({ kind: 'space', path: 'spaces/yard.json', object: 1 });
    expect(placed('E061')).toEqual({ kind: 'space', path: 'prefabs/crate.json', object: 0 });
    expect(placed('E007', 'spaces/broken.json')).toEqual({ kind: 'space', path: 'spaces/broken.json' });
    expect(placed('W141')).toBeNull();
    expect(fileTitle('spaces/yard.json', catalog, null)).toBe('Space yard');
    expect(fileTitle('prefabs/crate.json', catalog, null)).toBe('Prefab crate');
  });

  it('says where in words, and titles each file', async () => {
    const { catalog, index, editor } = await both(broken());
    const find = (code: string) => editor.find((d) => d.code === code) as (typeof editor)[number];
    expect(whereOf(find('E001'), catalog)).toBe('Might');
    expect(whereOf(editor.find((d) => d.code === 'E015' && d.file === 'types/beast.json') as never, catalog)).toBe(
      'name › min',
    );
    expect(fileTitle('components/hold.json', catalog, index)).toBe('Component kind hold');
    expect(whereOf(find('E020'), catalog)).toBe('portraits/spiculus.svg › licence');
    expect(whereOf(find('E008'), catalog)).toBe('version');
    expect(fileTitle('records/gladiator/spiculus.json', catalog, index)).toBe('Gladiator Spiculus');
    expect(fileTitle('records/gladiator/flamma.json', catalog, index)).toBe('Gladiator flamma');
    expect(fileTitle('types/gladiator.json', catalog, index)).toBe('Type Gladiator');
    expect(fileTitle('types/beast.json', catalog, index)).toBe('Type beast');
    expect(fileTitle('project.json', catalog, index)).toBe('Project settings (project.json)');
    expect(fileTitle('records/stray.json', catalog, index)).toBe('records/stray.json');
  });
});

describe('the panel’s view', () => {
  it('groups by file in the compiler’s order, and filters by severity and every word', async () => {
    const { catalog, index, editor } = await both(broken());
    const groups = groupProblems(editor, catalog, index);
    expect(groups.map((g) => g.file)).toEqual([...new Set(editor.map((d) => d.file))]);
    expect(groups.flatMap((g) => g.problems)).toEqual(editor);
    const shown = (view: Partial<typeof ALL_PROBLEMS>) =>
      shownGroups(groups, { ...ALL_PROBLEMS, ...view }, catalog).flatMap((g) => g.problems.map((p) => p.code));
    expect(shown({ severity: 'warning' }).sort()).toEqual([
      'W101',
      'W105',
      'W106',
      'W107',
      'W141',
      'W142',
      'W143',
      'W144',
      'W145',
    ]);
    expect(shown({ search: 'spiculus might' })).toEqual(['E001']);
    expect(shown({ search: 'E020' })).toEqual(['E020']);
    expect(shown({ search: 'nothing like this' })).toEqual([]);
    // A file none of whose problems are shown is left out, not listed empty.
    const e020 = editor.find((d) => d.code === 'E020');
    expect(shownGroups(groups, { ...ALL_PROBLEMS, search: 'E020' }, catalog).map((g) => g.file)).toEqual([e020?.file]);
  });

  it('counts errors and warnings in words, the badge’s tally the same without listing them', async () => {
    const { catalog, index, editor } = await both(broken());
    const counts = countProblems(editor);
    expect(tally(catalog, index)).toEqual(counts);
    expect(counts.warnings).toBe(9);
    expect(countsText(counts)).toBe(`${counts.errors} errors and 9 warnings`);
    expect(countsText({ errors: 1, warnings: 0 })).toBe('1 error');
    expect(countsText({ errors: 0, warnings: 0 })).toBe('No problems');
    expect(countsText({ errors: 0, warnings: 1 })).toBe('1 warning');
    expect(badgeText(counts)).toBe(String(counts.errors + 9));
    expect(badgeText({ errors: 0, warnings: 0 })).toBeNull();
    expect(badgeText(null)).toBeNull();
  });
});
