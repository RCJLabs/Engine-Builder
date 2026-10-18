import { compileProject, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../forms/catalog.ts';
import { ALL_ASSETS, assetProblems, assetRows, logPointer, shownRows } from './assetList.ts';

const CC0 = { licence: 'CC0-1.0', source: 'https://kenney.nl', date: '2026-10-18' };

function project(log: unknown, extra: Record<string, string> = {}) {
  return memorySource({
    ...readFixture(FIXTURE_LUDUS),
    'assets/assets.json': typeof log === 'string' ? log : JSON.stringify(log),
    'assets/ui/button.png': 'png',
    'assets/music/Theme.ogg': 'ogg',
    'assets/fonts/OFL.txt': 'notice',
    ...extra,
  });
}

const LOG = {
  files: {
    'fonts/OFL.txt': { ...CC0, licence: 'OFL-1.1', author: 'SIL' },
    'gone.png': CC0,
    'music/Theme.ogg': { ...CC0, licence: 'CC-BY-4.0' },
    'portraits/spiculus.svg': { ...CC0, standIn: true },
    'ui/button.png': { ...CC0, licence: 'CC-BY-SA-4.0', colour: 'red' },
  },
};

describe('the assets’ problems', () => {
  it('puts each where the panel shows it, and they are the compiler’s, file and pointer alike', async () => {
    const source = project(LOG);
    const problems = assetProblems(await readCatalog(source));
    const shown = [...problems.byAsset].flatMap(([asset, list]) =>
      list.map((d) => `${d.code} ${d.file}#${d.file === 'assets/assets.json' ? logPointer(asset, d.path) : d.path}`),
    );
    expect(problems.orphans).toEqual(['gone.png']);
    expect(problems.log).toEqual([]);
    const compiled = (await compileProject(source, [])).diagnostics
      .filter((d) => d.code !== 'W106')
      .map((d) => `${d.code} ${d.file}#${d.path}`);
    expect(shown.sort()).toEqual(compiled.sort());
    expect(problems.byAsset.get('ui/button.png')?.map((d) => `${d.code} ${d.path}`)).toEqual([
      'E021 /colour',
      'E020 /licence',
    ]);
    expect(problems.byAsset.get('music/Theme.ogg')?.map((d) => `${d.code} ${d.path} ${d.message}`)).toEqual([
      'E020 /author CC BY 4.0 asks for credit: say who made it',
    ]);
    expect(problems.byAsset.get('portraits/spiculus.svg')?.map((d) => d.code)).toEqual(['W107']);
  });

  it('lists an entry for a gone file once, whatever else is wrong with it', async () => {
    const gone = { 'gone.png': { ...CC0, licence: 'CC-BY-NC-4.0', colour: 'red' } };
    const problems = assetProblems(await readCatalog(project({ files: { ...LOG.files, ...gone } })));
    expect(problems.orphans).toEqual(['gone.png']);
    expect([...problems.byAsset.keys()]).not.toContain('gone.png');
  });

  it('says once when the log can’t be read, and what is wrong with it as a whole', async () => {
    const broken = assetProblems(await readCatalog(project('{ "files": ')));
    expect(broken.log.map((d) => d.code)).toEqual(['E007']);
    expect(broken.byAsset.size).toBe(0);
    const wrong = assetProblems(await readCatalog(project({ files: LOG.files, notes: 'x' })));
    expect(wrong.log.map((d) => `${d.code} ${d.path}`)).toEqual(['E021 /notes']);
  });

  it('gives a file with no entry E019, a pointer with a slash in its path included', async () => {
    const problems = assetProblems(await readCatalog(project({ files: {} })));
    expect(problems.byAsset.get('ui/button.png')?.map((d) => `${d.code} ${d.file}`)).toEqual([
      'E019 assets/ui/button.png',
    ]);
  });
});

describe('the rows a view shows', () => {
  it('filters by kind, by problems and by every word searched, path and log alike', async () => {
    const catalog = await readCatalog(project(LOG));
    const rows = assetRows(catalog, assetProblems(catalog));
    const paths = (view: Partial<typeof ALL_ASSETS>) => shownRows(rows, { ...ALL_ASSETS, ...view }).map((r) => r.path);
    expect(paths({})).toEqual(['fonts/OFL.txt', 'music/Theme.ogg', 'portraits/spiculus.svg', 'ui/button.png']);
    expect(paths({ kind: 'image' })).toEqual(['portraits/spiculus.svg', 'ui/button.png']);
    expect(paths({ kind: 'other' })).toEqual(['fonts/OFL.txt']);
    expect(paths({ kind: 'audio' })).toEqual(['music/Theme.ogg']);
    expect(paths({ troubled: true })).toEqual(['music/Theme.ogg', 'portraits/spiculus.svg', 'ui/button.png']);
    expect(paths({ search: 'theme' })).toEqual(['music/Theme.ogg']);
    expect(paths({ search: 'sil  fonts' })).toEqual(['fonts/OFL.txt']);
    expect(paths({ search: 'kenney cc-by-4.0' })).toEqual(['music/Theme.ogg']);
    expect(paths({ search: 'nothing' })).toEqual([]);
  });
});
