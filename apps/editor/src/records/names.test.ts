import { memorySource } from '@eb/compiler';
import type { TypeFile } from '@eb/schema';
import { SHEET_TYPE_FILE } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../forms/catalog.ts';
import { refChoices } from '../forms/refChoices.ts';
import { copyName, nameIn, namesOf } from './names.ts';
import { describePath } from './paths.ts';
import { EMPTY_INDEX, updateIndex } from './recordIndex.ts';

const ludus = async () => {
  const source = memorySource(readFixture(FIXTURE_LUDUS));
  const catalog = await readCatalog(source);
  return { catalog, index: await updateIndex(EMPTY_INDEX, source, catalog, null) };
};

describe('record names', () => {
  const named: TypeFile = { title: 'T', nameField: 'name', fields: { name: { kind: 'text', optional: true } } };

  it('reads the name the type names, and nothing when there is none to read', () => {
    expect(nameIn(named, { name: '  Spiculus ' })).toBe('Spiculus');
    expect(nameIn(named, { name: '   ' })).toBeUndefined();
    expect(nameIn(named, { name: 7 })).toBeUndefined();
    expect(nameIn(named, {})).toBeUndefined();
    expect(nameIn(named, ['Spiculus'])).toBeUndefined();
    expect(nameIn({ ...named, nameField: undefined } as TypeFile, { name: 'Spiculus' })).toBeUndefined();
    expect(nameIn(undefined, { name: 'Spiculus' })).toBeUndefined();
  });

  it('names records from the index', async () => {
    const { catalog, index } = await ludus();
    const names = namesOf(index, catalog);
    expect(names('school:ludus-magnus')).toBe('Ludus Magnus');
    expect(names('school:nowhere')).toBeUndefined();
    expect(namesOf(null, catalog)('school:ludus-magnus')).toBeUndefined();
  });

  it('offers a copy the first number whose id is free', () => {
    expect(copyName('Spiculus', ['spiculus'])).toBe('Spiculus 2');
    expect(copyName('Spiculus', ['spiculus', 'spiculus-2', 'spiculus-3'])).toBe('Spiculus 4');
    expect(copyName('ludus-magnus', ['ludus-magnus'])).toBe('ludus-magnus 2');
  });

  it('shows names beside ids in a ref field’s choices, and finds them by id too', async () => {
    const { catalog, index } = await ludus();
    const names = namesOf(index, catalog);
    expect(refChoices({ kind: 'ref', to: 'school' }, catalog.records, names)).toEqual([
      { value: 'ludus-dacicus', label: 'Ludus Dacicus (ludus-dacicus)', keywords: 'school ludus-dacicus' },
      { value: 'ludus-magnus', label: 'Ludus Magnus (ludus-magnus)', keywords: 'school ludus-magnus' },
    ]);
    expect(refChoices({ kind: 'ref', to: ['school', 'weapon'] }, catalog.records, names)[2]).toEqual({
      value: 'weapon:gladius',
      label: 'Gladius (weapon:gladius)',
      keywords: 'weapon gladius',
    });
    // Without names, as before M2.5.
    expect(refChoices({ kind: 'ref', to: 'school' }, catalog.records)[0]).toEqual({
      value: 'ludus-dacicus',
      label: 'ludus-dacicus',
    });
  });
});

describe('describePath', () => {
  it('says where a path points in the words a form uses', async () => {
    const { catalog } = await ludus();
    const gladiator = catalog.types.get('gladiator')?.file;
    expect(describePath(gladiator, '/school')).toBe('School');
    expect(describePath(gladiator, '/kit/gladius')).toBe('Weapons carried: gladius');
    expect(describePath(gladiator, '/skills/1')).toBe('Skills, item 2');
    // A sheet's places, by its layout's type file (M3.1).
    expect(describePath(SHEET_TYPE_FILE, '/rows/0/when/event')).toBe('Rows, item 1: When: Event');
    expect(describePath(SHEET_TYPE_FILE, '/rows/1/do/0/flag')).toBe('Rows, item 2: Do, item 1: flag');
    expect(describePath(gladiator, '/record/wins')).toBe('Wins and losses: Wins');
    expect(describePath(gladiator, '/fights')).toBe('Fights when');
    // What the type doesn't describe reads as the path.
    expect(describePath(gladiator, '/nowhere/3')).toBe('/nowhere/3');
    expect(describePath(gladiator, '/skills/x')).toBe('/skills/x');
    expect(describePath(undefined, '/school')).toBe('/school');
  });
});
