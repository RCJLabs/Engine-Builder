import { memorySource } from '@eb/compiler';
import type { ValueDef } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../forms/catalog.ts';
import { cellText } from './cells.ts';
import { type Filter, filterProblem, matchesFilter, testsFor } from './filters.ts';
import { namesOf } from './names.ts';
import { EMPTY_INDEX, updateIndex } from './recordIndex.ts';
import { type Column, columnsOf, type Row, rowsOf } from './table.ts';
import { sortRows, viewRows } from './view.ts';
import { DEFAULT_VIEW } from './viewState.ts';

/** The ludus project's rows of a type, with records added or changed. */
async function table(type: string, records: Record<string, unknown> = {}) {
  const files: Record<string, string> = readFixture(FIXTURE_LUDUS);
  for (const [path, value] of Object.entries(records)) files[path] = JSON.stringify(value);
  const source = memorySource(files);
  const catalog = await readCatalog(source);
  const index = await updateIndex(EMPTY_INDEX, source, catalog, null);
  const columns = columnsOf(catalog.types.get(type)?.file);
  const rows = rowsOf(index, catalog, type, namesOf(index, catalog));
  const column = (key: string) => columns.find((c) => c.key === key) as Column;
  const text = (id: string, key: string) => rows.find((r) => r.record.id === id)?.texts.get(key);
  const ids = (list: readonly Row[]) => list.map((row) => row.record.id);
  return { columns, rows, column, text, ids };
}

const noNames = () => undefined;

describe('columnsOf', () => {
  it('gives the record, each field but the one that names records, then problems and users', async () => {
    const { columns } = await table('gladiator');
    expect(columns.map((c) => c.label)).toEqual([
      'Name',
      'Might',
      'Style',
      'School',
      'Freed',
      'Skills',
      'Weapons carried',
      'Wins and losses',
      'Portrait',
      'Fights when',
      'Story',
      'Problems',
      'Used by',
    ]);
    expect(columnsOf(undefined).map((c) => c.label)).toEqual(['Id', 'Problems', 'Used by']);
  });
});

describe('cellText', () => {
  it('reads each kind as one line, refs by the name of what they name', async () => {
    const { text } = await table('gladiator');
    expect(text('spiculus', 'field:might')).toBe('72');
    expect(text('spiculus', 'field:style')).toBe('murmillo');
    expect(text('spiculus', 'field:school')).toBe('Ludus Magnus');
    expect(text('spiculus', 'field:free')).toBe('No');
    expect(text('spiculus', 'field:skills')).toBe('feint, shield wall');
    expect(text('priscus', 'field:kit')).toBe('Trident: 1, Net: 1');
    expect(text('spiculus', 'field:record')).toBe('Wins 12, Losses 1');
    expect(text('spiculus', 'field:portrait')).toBe('portraits/spiculus.svg');
    expect(text('spiculus', 'field:fights')).toBe('arena.day and not crowd.angry');
    expect(text('flamma', 'field:fights')).toBe('arena.day');
    expect(text('spiculus', 'field:story')).toBe('Nero’s favourite. Given a palace by the emperor.'.replace('’', "'"));
    expect(text('flamma', 'field:portrait')).toBe('');
    expect(text('flamma', 'field:skills')).toBe('');
  });

  it('shows a value of the wrong shape as it is written, and cuts a long one', () => {
    const int: ValueDef = { kind: 'int' };
    expect(cellText(int, 'high', noNames)).toBe('"high"');
    expect(cellText({ kind: 'list', of: int }, { a: 1 }, noNames)).toBe('{"a":1}');
    expect(cellText({ kind: 'ref', to: ['school', 'weapon'] }, 'weapon:net', (key) => `<${key}>`)).toBe('<weapon:net>');
    expect(cellText({ kind: 'ref', to: 'school' }, 'nowhere', noNames)).toBe('nowhere');
    const long = cellText({ kind: 'list', of: { kind: 'text' } }, Array(100).fill('shield wall'), noNames);
    expect(long.length).toBe(160);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('sortRows', () => {
  const gladiator = (name: string, might?: number, style = 'murmillo') => ({
    name,
    ...(might === undefined ? {} : { might }),
    style,
    school: 'ludus-magnus',
    free: false,
    skills: [],
    record: { wins: 0, losses: 0 },
  });

  it('sorts numbers as numbers, choices in the order the type lists them, and names with digits as numbers', async () => {
    const { rows, column, ids } = await table('gladiator', {
      'records/gladiator/g10.json': gladiator('Gladiator 10', 9),
      'records/gladiator/g2.json': gladiator('Gladiator 2', 100, 'thraex'),
    });
    expect(ids(sortRows(rows, column('field:might'), false))).toEqual(['g10', 'priscus', 'spiculus', 'flamma', 'g2']);
    expect(ids(sortRows(rows, column('field:might'), true))).toEqual(['g2', 'flamma', 'spiculus', 'priscus', 'g10']);
    // retiarius, murmillo, secutor, thraex: the type's order, not the alphabet's.
    expect(ids(sortRows(rows, column('field:style'), false))).toEqual(['priscus', 'g10', 'spiculus', 'flamma', 'g2']);
    expect(ids(sortRows(rows, column('record'), false))).toEqual(['flamma', 'g2', 'g10', 'priscus', 'spiculus']);
  });

  it('puts records without the value last either way, and ties in id order', async () => {
    const { rows, column, ids } = await table('gladiator', {
      'records/gladiator/a.json': gladiator('A'),
      'records/gladiator/b.json': gladiator('B'),
    });
    const portrait = column('field:portrait');
    expect(ids(sortRows(rows, portrait, false))).toEqual(['spiculus', 'a', 'b', 'flamma', 'priscus']);
    expect(ids(sortRows(rows, portrait, true))).toEqual(['spiculus', 'a', 'b', 'flamma', 'priscus']);
    expect(ids(sortRows(rows, column('field:might'), true)).slice(-2)).toEqual(['a', 'b']);
  });

  it('sorts by problems and by how many use a record', async () => {
    const { rows, column, ids } = await table('school', {
      'records/gladiator/a.json': {
        name: 'A',
        might: 500,
        style: 'murmillo',
        school: 'ludus-dacicus',
        free: false,
        skills: [],
        record: { wins: 0, losses: 0 },
      },
      'records/school/ludus-novus.json': { name: 'Ludus Novus', colour: 'red' },
    });
    expect(ids(sortRows(rows, column('used-by'), true))).toEqual(['ludus-dacicus', 'ludus-magnus', 'ludus-novus']);
    expect(ids(sortRows(rows, column('problems'), true))).toEqual(['ludus-novus', 'ludus-dacicus', 'ludus-magnus']);
  });
});

describe('viewRows', () => {
  it('keeps the rows holding every word searched for, by name, id, ref names or ref ids, accents aside', async () => {
    const { rows, columns, ids } = await table('gladiator', {
      'records/gladiator/crixus.json': {
        name: 'Crixús',
        might: 70,
        style: 'thraex',
        school: 'ludus-dacicus',
        free: true,
        skills: ['Gaulish fury'],
        record: { wins: 3, losses: 0 },
      },
    });
    const search = (text: string) => ids(viewRows(rows, columns, { ...DEFAULT_VIEW, search: text }));
    expect(search('crixus')).toEqual(['crixus']);
    expect(search('MAGNUS')).toEqual(['priscus', 'spiculus']);
    expect(search('ludus-magnus')).toEqual(['priscus', 'spiculus']);
    expect(search('magnus feint')).toEqual(['spiculus']);
    expect(search('  ')).toEqual(['crixus', 'flamma', 'priscus', 'spiculus']);
    expect(search('nobody')).toEqual([]);
  });

  it('keeps the rows every complete filter passes, in the view’s order', async () => {
    const { rows, columns, ids } = await table('gladiator');
    const view = (...filters: Filter[]) => ids(viewRows(rows, columns, { ...DEFAULT_VIEW, filters }));
    const f = (column: string, test: Filter['test'], value = ''): Filter => ({ column, test, value });
    expect(view(f('field:might', 'at-least', '70'))).toEqual(['flamma', 'spiculus']);
    expect(view(f('field:might', 'below', '72'))).toEqual(['priscus']);
    expect(view(f('field:might', 'is', '65'))).toEqual(['priscus']);
    expect(view(f('field:might', 'is-not', '65'))).toEqual(['flamma', 'spiculus']);
    expect(view(f('field:school', 'is', 'ludus-magnus'))).toEqual(['priscus', 'spiculus']);
    expect(view(f('field:free', 'is', 'true'))).toEqual(['flamma']);
    expect(view(f('field:skills', 'contains', 'NET'))).toEqual(['priscus']);
    expect(view(f('field:skills', 'empty'))).toEqual(['flamma']);
    // Weapons carried shows names and holds ids: either finds them.
    expect(view(f('field:kit', 'contains', 'trident'))).toEqual(['priscus']);
    expect(view(f('field:kit', 'not-empty'))).toEqual(['priscus', 'spiculus']);
    expect(view(f('field:kit', 'empty'))).toEqual(['flamma']);
    expect(view(f('field:portrait', 'set'))).toEqual(['spiculus']);
    expect(view(f('field:fights', 'is', 'arena.day'))).toEqual(['flamma']);
    expect(view(f('field:story', 'contains', 'palace'))).toEqual(['spiculus']);
    expect(view(f('record', 'contains', 'Pris'))).toEqual(['priscus']);
    expect(view(f('field:might', 'at-least', '70'), f('field:free', 'is', 'false'))).toEqual(['spiculus']);
    expect(view(f('problems', 'none'), f('used-by', 'any'))).toEqual([]);
  });

  it('finds a list’s items by what the cell shows or by what the file holds', async () => {
    const { rows, columns, ids, text } = await table('troupe', {
      'types/troupe.json': { title: 'Troupe', fields: { schools: { kind: 'list', of: { kind: 'ref', to: 'school' } } } },
      'records/troupe/t1.json': { schools: ['ludus-magnus'] },
      'records/troupe/t2.json': { schools: ['ludus-dacicus'] },
    });
    expect(text('t1', 'field:schools')).toBe('Ludus Magnus');
    const contains = (value: string) =>
      ids(viewRows(rows, columns, { ...DEFAULT_VIEW, filters: [{ column: 'field:schools', test: 'contains', value }] }));
    expect(contains('magnus')).toEqual(['t1']);
    // The id, which the cell shows by name only.
    expect(contains('ludus-mag')).toEqual(['t1']);
  });

  it('lets an incomplete filter through, saying why', async () => {
    const { rows, columns, column } = await table('gladiator');
    const all = rows.length;
    for (const filter of [
      { column: 'field:might', test: 'at-least', value: '' },
      { column: 'field:might', test: 'at-least', value: 'lots' },
      { column: 'field:gone', test: 'is', value: 'x' },
      { column: 'field:free', test: 'below', value: '1' },
    ] as Filter[]) {
      expect(viewRows(rows, columns, { ...DEFAULT_VIEW, filters: [filter] })).toHaveLength(all);
      expect(matchesFilter(rows[0] as Row, columns, filter)).toBeNull();
    }
    expect(filterProblem(column('field:might'), { column: 'field:might', test: 'at-least', value: '' })).toBe(
      'Give a value to compare with',
    );
    expect(filterProblem(column('field:might'), { column: 'field:might', test: 'at-least', value: 'lots' })).toBe(
      '“lots” isn’t a number',
    );
    expect(filterProblem(undefined, { column: 'field:gone', test: 'is', value: 'x' })).toBe('That column has gone');
  });
});

describe('testsFor', () => {
  it('offers the tests a column’s kind can answer', async () => {
    const { column } = await table('gladiator');
    const tests = (key: string) => testsFor(column(key)).map((t) => t.test);
    expect(tests('field:might')).toEqual(['is', 'is-not', 'below', 'at-most', 'above', 'at-least', 'set', 'not-set']);
    expect(tests('field:school')).toEqual(['is', 'is-not', 'set', 'not-set']);
    expect(tests('field:skills')).toEqual(['contains', 'empty', 'not-empty']);
    expect(tests('field:record')).toEqual(['set', 'not-set']);
    expect(tests('field:story')).toEqual(['contains', 'is', 'is-not', 'set', 'not-set']);
    expect(tests('record')).toEqual(['contains', 'is']);
    expect(tests('problems')).toEqual(['any', 'none']);
  });
});
