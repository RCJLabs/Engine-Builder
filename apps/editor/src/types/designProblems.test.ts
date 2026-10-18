import { compileProject, memorySource } from '@eb/compiler';
import { ITEM_TYPE_FILE } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { arena, FIGHTER } from '../../test/fighter.ts';
import { routedProblems, typeProblems } from './designProblems.ts';
import { summary } from './kinds.ts';

const TYPES = ['beast', 'fighter', 'school', 'weapon'];

/** The arena with its fighter type file replaced by `json`. */
const withFighter = (json: unknown) => ({ ...arena(), 'types/fighter.json': JSON.stringify(json) });

/** The compiler's problems with the fighter type file, as the designer reports them. */
async function compiled(json: unknown): Promise<string[]> {
  const { diagnostics } = await compileProject(memorySource(withFighter(json)), []);
  return diagnostics.filter((d) => d.file === 'types/fighter.json').map((d) => `${d.code} ${d.path}: ${d.message}`);
}

const said = (json: unknown) =>
  typeProblems(json, TYPES, 'types/fighter.json').map((d) => `${d.code} ${d.path}: ${d.message}`);

describe('the designer’s problems', () => {
  it.each([
    ['a misspelled key', { ...FIGHTER, fields: { ...FIGHTER.fields, name: { kind: 'text', optinal: true } } }],
    [
      'a choice listed twice',
      { ...FIGHTER, fields: { ...FIGHTER.fields, style: { kind: 'enum', values: ['a', 'a'] } } },
    ],
    ['bounds out of order', { ...FIGHTER, fields: { ...FIGHTER.fields, name: { kind: 'text', min: 5, max: 2 } } }],
    ['a name field of another kind', { ...FIGHTER, nameField: 'record' }],
    ['no title', { fields: FIGHTER.fields }],
    [
      'a ref to a type with no file',
      { ...FIGHTER, fields: { ...FIGHTER.fields, school: { kind: 'ref', to: 'academy' } } },
    ],
    ['a sound file', FIGHTER],
  ])('are the compiler’s for %s', async (_name, json) => {
    expect(said(json)).toEqual(await compiled(json));
  });

  it('shows each where the designer has a place for it', () => {
    const json = {
      ...FIGHTER,
      nameField: 'nobody',
      fields: {
        ...FIGHTER.fields,
        name: { kind: 'text', optinal: true },
        style: { kind: 'enum', values: ['a', 'a'] },
        rival: { kind: 'ref', to: ['fighter', 'academy'] },
      },
    };
    const routed = routedProblems(json, TYPES, 'types/fighter.json');
    expect([...routed.keys()].sort()).toEqual(['/fields/name']);
    // Shape first: once it is sound, the rules and the refs.
    const sound = { ...json, fields: { ...json.fields, name: { kind: 'text' } } };
    expect([...routedProblems(sound, TYPES, 'types/fighter.json').keys()].sort()).toEqual([
      '/fields/style/values/1',
      '/nameField',
    ]);
    const refs = { ...sound, nameField: 'name', fields: { ...sound.fields, style: { kind: 'enum', values: ['a'] } } };
    expect([...routedProblems(refs, TYPES, 'types/fighter.json').keys()]).toEqual(['/fields/rival/to/1']);
  });
});

describe('the designer’s problems for a kit’s type', () => {
  /** The arena with the inventory kit on and `json` as the fields of its own on the kit's item. */
  const withItem = (json: unknown) => ({
    ...arena(),
    'project.json': JSON.stringify({ format: 1, id: 'arena', name: 'Arena', version: '0.1.0', kits: ['inventory'] }),
    'types/item.json': JSON.stringify(json),
  });
  const kitTypes = [...TYPES, 'item', 'loot-table'];
  const ITEM = { id: 'inventory', type: 'item', file: ITEM_TYPE_FILE };

  it.each([
    ['a field with a kit field’s name', { title: 'Item', fields: { value: { kind: 'int' }, maker: { kind: 'text' } } }],
    ['a name field of the kit’s', { title: 'Part', nameField: 'name', fields: { maker: { kind: 'text' } } }],
    ['a ref to a kit’s type', { title: 'Item', fields: { drops: { kind: 'ref', to: 'loot-table' } } }],
    ['a misspelled key', { title: 'Item', fields: { maker: { kind: 'text', optinal: true } } }],
    ['a ref to a type with no file', { title: 'Item', fields: { maker: { kind: 'ref', to: 'guild' } } }],
  ])('are the compiler’s for %s, joined to the kit’s first', async (_name, json) => {
    const { diagnostics } = await compileProject(memorySource(withItem(json)), []);
    const compiled = diagnostics
      .filter((d) => d.file === 'types/item.json')
      .map((d) => `${d.code} ${d.path}: ${d.message}`);
    const shown = typeProblems(json, kitTypes, 'types/item.json', ITEM).map((d) => `${d.code} ${d.path}: ${d.message}`);
    expect(shown).toEqual(compiled);
  });

  it('says a field with a kit field’s name is the kit’s, at that field', () => {
    const json = { title: 'Item', fields: { value: { kind: 'int' } } };
    expect(typeProblems(json, kitTypes, 'types/item.json', ITEM).map((d) => `${d.code} ${d.path}`)).toEqual([
      'E037 /fields/value',
    ]);
    expect([...routedProblems(json, kitTypes, 'types/item.json', ITEM).keys()]).toEqual(['/fields/value']);
  });
});

describe('summaries', () => {
  const title = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);
  it.each([
    [{ kind: 'text', min: 1, max: 40 }, 'Text, 1 to 40 characters'],
    [{ kind: 'text', multiline: true, optional: true }, 'Text, several lines, optional'],
    [{ kind: 'int', min: 0, max: 100 }, 'Whole number, 0 to 100'],
    [{ kind: 'number', min: 1 }, 'Number, at least 1'],
    [{ kind: 'enum', values: ['a', 'b'] }, 'Choice of 2'],
    [{ kind: 'ref', to: ['fighter', 'beast'] }, 'Record: Fighter or Beast'],
    [{ kind: 'list', of: { kind: 'text' }, max: 1 }, 'List of text, at most 1 item'],
    [{ kind: 'map', key: { kind: 'ref', to: 'weapon' }, of: { kind: 'int' } }, 'Map of whole number, by Weapon'],
    [{ kind: 'map', of: { kind: 'bool' } }, 'Map of yes or no, by name'],
    [{ kind: 'group', fields: { a: { kind: 'int' } } }, 'Group of 1 field'],
    [{ kind: 'asset', of: 'image' }, 'File: image'],
    [{ kind: 'video' }, 'Not a field the format knows'],
  ])('says what %j holds', (def, words) => {
    expect(summary(def, title)).toBe(words);
  });
});
