/**
 * A battle's form's choices (M7.5, D87): its Space from the project's spaces, each unit's At from the objects
 * of the space it names, and nothing for any other field, nor objects before a space is named.
 */
import { describe, expect, it } from 'vitest';
import { battleChoices } from './battleChoices.ts';

const SOURCES = {
  spaces: ['hold', 'deck'],
  objects: new Map([
    ['deck', new Set(['hatch-1', 'bridge-1', 'alarm'])],
    ['hold', new Set(['crate'])],
  ]),
};
const BATTLE = { name: 'The boarders', space: 'deck', crew: [{ actor: 'ines', at: '' }], foes: [] };

describe('a battle’s choices', () => {
  it('offers the spaces for its Space, and the named space’s objects for a unit’s At on either side', () => {
    expect(battleChoices(BATTLE, SOURCES, ['space'])).toEqual(['deck', 'hold']);
    expect(battleChoices(BATTLE, SOURCES, ['crew', 0, 'at'])).toEqual(['alarm', 'bridge-1', 'hatch-1']);
    expect(battleChoices(BATTLE, SOURCES, ['foes', 2, 'at'])).toEqual(['alarm', 'bridge-1', 'hatch-1']);
    expect(battleChoices({ ...BATTLE, space: 'hold' }, SOURCES, ['foes', 0, 'at'])).toEqual(['crate']);
  });

  it('offers no objects before a space is named, and nothing for any other field', () => {
    expect(battleChoices({ crew: [] }, SOURCES, ['crew', 0, 'at'])).toEqual([]);
    expect(battleChoices(BATTLE, SOURCES, ['crew', 0, 'actor'])).toBeUndefined();
    expect(battleChoices(BATTLE, SOURCES, ['name'])).toBeUndefined();
    expect(battleChoices(BATTLE, SOURCES, ['crew'])).toBeUndefined();
  });
});
