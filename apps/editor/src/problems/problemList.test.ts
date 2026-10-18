import { compileProject, memorySource } from '@eb/compiler';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../forms/catalog.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { countProblems, countsText, projectProblems, tally } from './collect.ts';
import { ALL_PROBLEMS, fileTitle, groupProblems, placeOf, shownGroups, whereOf } from './problemList.ts';

const ludus = () => readFixture(FIXTURE_LUDUS);
const json = (value: unknown) => JSON.stringify(value, null, 2);
const spiculus = () => JSON.parse(ludus()['records/gladiator/spiculus.json'] as string);
const own = { licence: 'own', source: 'Drawn', date: '2026-10-18' };

/** The ludus fixture broken every way the compiler can tell, each file once. */
function broken(): Record<string, string> {
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

async function both(files: Record<string, string>) {
  const source = memorySource(files);
  const catalog = await readCatalog(source);
  const index = await updateIndex(EMPTY_INDEX, source, catalog, null);
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
      'E018',
      'E019',
      'E020',
      'E021',
      'W101',
      'W105',
      'W106',
      'W107',
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
    expect(placed('E015')).toEqual({ kind: 'type', type: 'beast' });
    expect(placed('E008')).toEqual({ kind: 'panel', panel: 'project' });
    expect(placed('E019')).toEqual({ kind: 'asset', path: 'ui/button.png' });
    expect(placed('E020')).toEqual({ kind: 'asset', path: 'portraits/spiculus.svg' });
    expect(placed('W106')).toEqual({ kind: 'panel', panel: 'assets' });
    expect(placed('E010')).toBeNull();
    expect(placed('W105')).toBeNull();
  });

  it('says where in words, and titles each file', async () => {
    const { catalog, index, editor } = await both(broken());
    const find = (code: string) => editor.find((d) => d.code === code) as (typeof editor)[number];
    expect(whereOf(find('E001'), catalog)).toBe('Might');
    expect(whereOf(find('E015'), catalog)).toBe('name › min');
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
    expect(shown({ severity: 'warning' }).sort()).toEqual(['W101', 'W105', 'W106', 'W107']);
    expect(shown({ search: 'spiculus might' })).toEqual(['E001']);
    expect(shown({ search: 'E020' })).toEqual(['E020']);
    expect(shown({ search: 'nothing like this' })).toEqual([]);
  });

  it('counts errors and warnings in words, the badge’s tally the same without listing them', async () => {
    const { catalog, index, editor } = await both(broken());
    const counts = countProblems(editor);
    expect(tally(catalog, index)).toEqual(counts);
    expect(counts.warnings).toBe(4);
    expect(countsText(counts)).toBe(`${counts.errors} errors and 4 warnings`);
    expect(countsText({ errors: 1, warnings: 0 })).toBe('1 error');
    expect(countsText({ errors: 0, warnings: 0 })).toBe('No problems');
  });
});
