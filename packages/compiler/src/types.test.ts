import type { Diagnostic } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { sampleTypes } from '../../schema/test/samples.ts';
import { FIXTURE_LUDUS, readFixture } from '../test/fixture.ts';
import { compileProject, memorySource, projectFiles } from './index.ts';

// The ludus fixture's pack hash: a project made only of data, with a condition written as text.
const LUDUS_HASH = '34035cc3fb5fba7a';

const ludus = () => readFixture(FIXTURE_LUDUS);
function changed(changes: Record<string, string | null>): Record<string, string> {
  const files = ludus();
  for (const [path, content] of Object.entries(changes)) {
    if (content === null) delete files[path];
    else files[path] = content;
  }
  return files;
}
const compile = (files: Record<string, string>, types = sampleTypes.slice(0, 0)) =>
  compileProject(memorySource(files), types);
const brief = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.map(({ code, file, path, message }) => `${code} ${file}#${path}: ${message}`);

describe('a project made only of data', () => {
  it('compiles to its golden hash with its own types and no code types', async () => {
    const result = await compile(ludus());
    expect(brief(result.diagnostics)).toEqual([]);
    expect(result.records).toBe(8);
    expect([...result.dataTypes.keys()]).toEqual([
      'flag',
      'sheet',
      'sound',
      'ambience',
      'music',
      'gladiator',
      'school',
      'weapon',
    ]);
    expect(result.pack?.hash).toBe(LUDUS_HASH);
  });

  it('packs a condition written as text as its tree: the same pack either way', async () => {
    const spiculus = JSON.parse(ludus()['records/gladiator/spiculus.json'] as string);
    const asTree = { ...spiculus, fights: { all: [{ fact: 'arena.day' }, { not: { fact: 'crowd.angry' } }] } };
    const result = await compile(changed({ 'records/gladiator/spiculus.json': JSON.stringify(asTree) }));
    expect(result.pack?.hash).toBe(LUDUS_HASH);
  });

  it('carries types/ in the project’s files, and leaves the README beside it out', async () => {
    const files = await projectFiles(memorySource(ludus()));
    expect(files.filter((path) => path.startsWith('types/'))).toEqual([
      'types/gladiator.json',
      'types/school.json',
      'types/weapon.json',
    ]);
    expect(files).not.toContain('README.md');
  });

  it('gives the same diagnostics whatever order the files are listed in', async () => {
    const broken = changed({
      'types/weapon.json': '{ "title": "Weapon", "fields": { "name": { "kind": "txt" } } }',
      'records/gladiator/priscus.json': '{ "name": "" }',
    });
    const reversed = Object.fromEntries(Object.entries(broken).reverse());
    expect((await compile(reversed)).diagnostics).toEqual((await compile(broken)).diagnostics);
  });
});

describe('type file problems', () => {
  it('reports a type file that breaks the format, and leaves its records unchecked but real', async () => {
    const result = await compile(
      changed({ 'types/weapon.json': '{ "title": "Weapon", "fields": { "name": { "kind": "txt" } } }' }),
    );
    // Spiculus and Priscus still carry weapons: the type's records exist, so their refs resolve.
    expect(brief(result.diagnostics)).toEqual([
      'E015 types/weapon.json#/fields/name/kind: Expected a kind: text, int, number, bool, enum, ref, list, map, group, colour, asset, condition, effects',
    ]);
    expect(result.pack).toBeNull();
    expect([...result.dataTypes.keys()]).toEqual([
      'flag',
      'sheet',
      'sound',
      'ambience',
      'music',
      'gladiator',
      'school',
    ]);
  });

  it('reports a type file that is not JSON once', async () => {
    const result = await compile(changed({ 'types/school.json': '{' }));
    expect(result.diagnostics.map((d) => `${d.code} ${d.file}`)).toEqual(['E007 types/school.json']);
  });

  it('reports a ref to a type the project does not have, at the ref', async () => {
    const gladiator = JSON.parse(ludus()['types/gladiator.json'] as string);
    gladiator.fields.school.to = 'academy';
    const result = await compile(changed({ 'types/gladiator.json': JSON.stringify(gladiator) }));
    expect(brief(result.diagnostics)).toEqual([
      'E016 types/gladiator.json#/fields/school/to: No record type "academy": add types/academy.json, or name a type the project has',
    ]);
  });

  it('takes a ref to a type whose file has problems as a ref to a type there is', async () => {
    const result = await compile(changed({ 'types/school.json': '{ "title": "" , "fields": {} }' }));
    expect(result.diagnostics.map((d) => `${d.code} ${d.file}#${d.path}`)).toEqual(['E015 types/school.json#/title']);
  });

  it.each([
    [
      'a type file in a folder',
      { 'types/old/weapon.json': '{}' },
      'E017 types/old/weapon.json#: A type file must sit at types/<type>.json',
    ],
    [
      'a name that is no type name',
      { 'types/Horse.json': '{}' },
      'E017 types/Horse.json#: "Horse" is not a valid type name',
    ],
    [
      'a file that is not JSON',
      { 'types/notes.md': 'Types go here.' },
      'W105 types/notes.md#: Ignored: type files are types/<type>.json',
    ],
    [
      'a file for the engine’s flag type',
      { 'types/flag.json': '{ "title": "Flag", "fields": {} }' },
      'E017 types/flag.json#: "flag" is one of the engine\'s own types (D36)',
    ],
    [
      'a file for the engine’s sheet type',
      { 'types/sheet.json': '{ "title": "Sheet", "fields": {} }' },
      'E017 types/sheet.json#: "sheet" is one of the engine\'s own types (D36)',
    ],
  ])('reports %s', async (_name, add, expected) => {
    const result = await compile({ ...ludus(), ...add });
    expect(brief(result.diagnostics)).toEqual([expect.stringContaining(expected)]);
  });

  it('lets the game’s code types win over a type file with the same name', async () => {
    const files = { ...ludus(), 'types/item.json': '{ "title": "Item", "fields": {} }' };
    const result = await compile(files, sampleTypes);
    expect(brief(result.diagnostics)).toEqual([
      'E017 types/item.json#: The game\'s code already defines the type "item", so this file is ignored',
    ]);
  });
});

describe('asset fields', () => {
  it('name files under assets/ (E018)', async () => {
    const result = await compile(changed({ 'assets/portraits/spiculus.svg': null }));
    expect(brief(result.diagnostics)).toEqual([
      'W106 assets/assets.json#/files/portraits~1spiculus.svg: No file assets/portraits/spiculus.svg: the entry can go',
      'E018 records/gladiator/spiculus.json#/portrait: No file assets/portraits/spiculus.svg',
    ]);
  });

  it('never name the provenance log, which is not an asset', async () => {
    const spiculus = JSON.parse(ludus()['records/gladiator/spiculus.json'] ?? '{}');
    const result = await compile(
      changed({ 'records/gladiator/spiculus.json': JSON.stringify({ ...spiculus, portrait: 'assets.json' }) }),
    );
    expect(brief(result.diagnostics)).toEqual([
      'E001 records/gladiator/spiculus.json#/portrait: Expected an image: .png, .jpg, .jpeg, .webp, .gif, .svg, .avif',
    ]);
  });
});

describe('asset provenance (M2.7, D34)', () => {
  it('passes the ludus fixture, whose one asset is logged, to the same hash as before', async () => {
    const result = await compile(ludus());
    expect(brief(result.diagnostics)).toEqual([]);
    expect(result.pack?.hash).toBe(LUDUS_HASH);
  });

  it('reports a file the log leaves out at the file, and the log’s problems in the log', async () => {
    const result = await compile(
      changed({
        'assets/portraits/flamma.png': 'png',
        'assets/assets.json': JSON.stringify({
          files: { 'portraits/spiculus.svg': { licence: 'CC-BY-SA-4.0', source: 'a forum', date: '2026-10-18' } },
        }),
      }),
    );
    expect(brief(result.diagnostics)).toEqual([
      'E020 assets/assets.json#/files/portraits~1spiculus.svg/licence: Refused: ShareAlike (SA) would bind what is made with it to the same licence',
      'E019 assets/portraits/flamma.png#: No provenance: log its licence and source',
    ]);
    expect(result.pack).toBeNull();
  });

  it('gives one E007 for a log that isn’t JSON, not an E019 for every asset', async () => {
    const result = await compile(changed({ 'assets/assets.json': '{ "files": ' }));
    expect(brief(result.diagnostics)).toEqual([expect.stringMatching(/^E007 assets\/assets\.json#: /)]);
  });

  it('lets a project with no assets have no log, and a log with no files have no entries', async () => {
    const result = await compile(
      changed({ 'assets/portraits/spiculus.svg': null, 'assets/assets.json': '{ "files": {} }' }),
    );
    expect(brief(result.diagnostics).filter((d) => !d.startsWith('E018'))).toEqual([]);
  });
});
