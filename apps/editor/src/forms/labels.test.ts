import { describe, expect, it } from 'vitest';
import { humanize, labelOf, slugify } from './labels.ts';

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
