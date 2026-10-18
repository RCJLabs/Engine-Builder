import { describe, expect, it } from 'vitest';
import { fieldNameOf, humanize, labelOf, slugify } from './labels.ts';

describe('humanize', () => {
  it.each([
    ['might', 'Might'],
    ['hitPoints', 'Hit points'],
    ['hit_points', 'Hit points'],
    ['hit-points', 'Hit points'],
    ['maxHP', 'Max HP'],
    ['HP', 'HP'],
    ['level2Boss', 'Level2 boss'],
  ])('reads %j as %j', (name, words) => {
    expect(humanize(name)).toBe(words);
  });

  it('gives way to a field’s own label', () => {
    expect(labelOf('free', { label: 'Freed' })).toBe('Freed');
    expect(labelOf('free', {})).toBe('Free');
  });
});

describe('slugify', () => {
  it.each([
    ['Ludus Magnus', 'ludus-magnus'],
    ['  Spiculus II  ', 'spiculus-ii'],
    ['Crème brûlée', 'creme-brulee'],
    ['a--b__c', 'a-b-c'],
    ['!!!', ''],
    ['日本', ''],
    [`${'x'.repeat(63)} y`, 'x'.repeat(63)],
  ])('makes %j into %j', (typed, id) => {
    expect(slugify(typed)).toBe(id);
  });
});

describe('fieldNameOf', () => {
  it.each([
    ['Hit points', 'hitPoints'],
    ['Max HP', 'maxHP'],
    ['HP max', 'hpMax'],
    ['  Fights when ', 'fightsWhen'],
    ['Café owner', 'cafeOwner'],
    ['hit_points', 'hit_points'],
    ['hit-points', 'hit-points'],
    ['hitPoints', 'hitPoints'],
    ['2nd wind', '2ndWind'],
  ])('makes %j the name %j', (typed, name) => {
    expect(fieldNameOf(typed)).toBe(name);
  });

  it('gives a name forms read back as the words typed', () => {
    for (const typed of ['Hit points', 'Max HP', 'Fights when']) expect(humanize(fieldNameOf(typed))).toBe(typed);
  });
});
