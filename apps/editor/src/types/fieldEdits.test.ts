import { describe, expect, it } from 'vitest';
import { FIGHTER } from '../../test/fighter.ts';
import { addFieldChange } from './fieldEdits.ts';

describe('field changes', () => {
  it('fills a new field where the type now lists it, before keys the type doesn’t list', () => {
    const { rewrite } = addFieldChange([], 'age', { kind: 'int' }, { value: 20 })(FIGHTER);
    expect(Object.keys(rewrite?.({ name: 'x', fights: 'a', stray: 1 }) as object)).toEqual([
      'name',
      'fights',
      'age',
      'stray',
    ]);
  });
});
