import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { checkGuide, opensInEditor } from './guide.ts';
import { zipProject } from './projectZip.ts';
import { memorySource } from './source.ts';
import { zipSource } from './zipSource.ts';

const step = (id: string, open: object) => ({ id, title: `Step ${id}`, text: 'Do the thing.', open });
const nothing = () => false;
const codes = (value: unknown, has: (file: string) => boolean = nothing) =>
  checkGuide(value, has).diagnostics.map((d) => `${d.code} ${d.path} ${d.message}`);

describe('guide.json', () => {
  it('is nothing to check when there is none', () => {
    expect(checkGuide(undefined, nothing)).toEqual({ guide: undefined, diagnostics: [] });
  });

  it('reads steps that open panels and files the project has', () => {
    const value = {
      title: 'Make the coast yours',
      steps: [step('play', { panel: 'play' }), step('debt', { file: 'records/resource/debt.json', at: '/start' })],
    };
    const checked = checkGuide(value, (file) => file === 'records/resource/debt.json');
    expect(checked.diagnostics).toEqual([]);
    expect(checked.guide?.steps.map((s) => s.id)).toEqual(['play', 'debt']);
  });

  it('is E057 for a shape it can’t read: no steps, an unknown key, a long title, a bad panel or pointer', () => {
    expect(codes({ steps: [] })).toEqual(['E057 /steps Too small: expected array to have >=1 items']);
    expect(codes({ steps: [{ ...step('a', { panel: 'play' }), hint: 'x' }] })).toEqual([
      'E057 /steps/0/hint Unknown field "hint"',
    ]);
    expect(codes({ steps: [step('a', { panel: 'play' })], title: 'x'.repeat(61) })[0]).toMatch(/^E057 \/title /);
    expect(codes({ steps: [step('a', { panel: 'shop' })] })[0]).toMatch(/^E057 \/steps\/0\/open Expected/);
    expect(codes({ steps: [step('a', { file: 'project.json', at: 'stages' })] })[0]).toMatch(/^E057 \/steps\/0\/open/);
    expect(codes({ steps: Array.from({ length: 21 }, (_, i) => step(`s${i}`, { panel: 'play' })) })).toEqual([
      'E057 /steps Too big: expected array to have <=20 items',
    ]);
  });

  it('is E057 for a step id used twice, at the second', () => {
    expect(codes({ steps: [step('a', { panel: 'play' }), step('a', { panel: 'logic' })] })).toEqual([
      'E057 /steps/1/id Another step is already "a"',
    ]);
  });

  it('is W140 for a file the project lacks, or one the editor has no place for', () => {
    expect(codes({ steps: [step('a', { file: 'records/item/rope.json' })] })).toEqual([
      'W140 /steps/0/open/file The project has no file "records/item/rope.json"',
    ]);
    const every = () => true;
    expect(
      codes({ steps: [step('a', { file: 'notes.txt' }), step('b', { file: 'records/rope.json' })] }, every),
    ).toEqual([
      'W140 /steps/0/open/file The editor has no place to open "notes.txt"',
      'W140 /steps/1/open/file The editor has no place to open "records/rope.json"',
    ]);
  });

  it('knows what the editor opens, as Problems does', () => {
    const opens = [
      'project.json',
      'export.json',
      'records/quest/debt.json',
      'types/gladiator.json',
      'scripts/harbour.ts',
      'scenes/boarding.ink',
      'ui/theme.json',
      'ui/harbour.json',
      'assets/sounds/bell.wav',
      // A space and a prefab in the Scene panel (M6.9).
      'spaces/green.json',
      'prefabs/cottage.json',
    ];
    expect(opens.filter(opensInEditor)).toEqual(opens);
    // A navmesh or a terrain's PNG is its space's own, made there, not opened.
    const none = ['guide.json', 'records/x.json', 'scenes/a/b.ink', 'assets/', 'README.md', 'spaces/green.nav'];
    expect([...none, 'spaces/green.height.png', 'spaces/a/b.json'].filter(opensInEditor)).toEqual([]);
  });

  it('is checked by compileProject against the project’s files, and travels in its zips', async () => {
    const files = {
      'project.json': '{ "format": 1, "id": "guided", "name": "Guided", "version": "0.1.0" }',
      'guide.json': JSON.stringify({
        steps: [step('name', { file: 'project.json' }), step('gone', { file: 'records/item/gone.json' })],
      }),
    };
    const result = await compileProject(memorySource(files), []);
    expect(result.diagnostics.map((d) => `${d.code} ${d.file} ${d.path}`)).toEqual([
      'W140 guide.json /steps/1/open/file',
    ]);
    // A warning only: the pack is made, and nothing in it is the guide's.
    expect(result.pack).not.toBeNull();
    expect(JSON.stringify(result.pack)).not.toContain('Step name');
    const zipped = zipSource(await zipProject(memorySource(files), 'guided'));
    expect(await zipped.files('')).toContain('guide.json');
  });
});
