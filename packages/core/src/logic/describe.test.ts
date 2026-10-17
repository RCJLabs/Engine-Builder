import { describe, expect, it } from 'vitest';
import { catalog } from '../../test/logic-catalog.ts';
import { describeCondition, parseCondition } from './index.ts';

const words = (text: string, withCatalog = true) => {
  const result = parseCondition(text, catalog);
  if (!result.ok) throw new Error(result.message);
  return describeCondition(result.condition, withCatalog ? catalog : undefined);
};

describe('describeCondition', () => {
  it.each([
    ['hold.count(medkit) >= 2 and not voyage.night', 'Needs 2 medkits and not night'],
    ['hold.count(medkit) >= 1', 'Needs 1 medkit'],
    // The fact's own wording covers only >=; the rest falls back to the default.
    ['hold.count(medkit) < 2', 'Hold count (medkit) is less than 2'],
    ['hold.credits <= 5', 'Credits is at most 5'],
    ['hold.credits > 5 or hold.credits == 0', 'Credits is more than 5 or credits is 0'],
    ['voyage.sector != void', 'Sector is not void'],
    ['voyage.night == false', 'Not night'],
    ['voyage.night != false', 'Night'],
    ['crew.trait(trait: brave, member: kit)', 'Crew trait (kit, brave)'],
    ['voyage.night and voyage.sector == rim and hold.credits > 0', 'Night, sector is rim and credits is more than 0'],
    [
      'voyage.night or (voyage.sector == rim and hold.credits > 0)',
      'Night or (sector is rim and credits is more than 0)',
    ],
    ['not (voyage.night or voyage.sector == rim)', 'Not (night or sector is rim)'],
    ['not not voyage.night', 'Not not night'],
  ])('words %j as %j', (text, expected) => {
    expect(words(text)).toBe(expected);
  });

  it('turns a negated comparison into its opposite, which is exact in three-valued logic', () => {
    expect(words('not hold.credits < 5')).toBe('Credits is at least 5');
    expect(words('not hold.credits <= 5')).toBe('Credits is more than 5');
    expect(words('not hold.credits > 5')).toBe('Credits is at most 5');
    expect(words('not hold.credits >= 5')).toBe('Credits is less than 5');
    expect(words('not voyage.sector == rim')).toBe('Sector is not rim');
    expect(words('not voyage.night == true')).toBe('Not night');
    expect(words('not hold.count(medkit) < 2')).toBe('Needs 2 medkits');
  });

  it('names facts by their ids without a catalog', () => {
    expect(words('crew.hp(member: kit) <= 3 and hold.credits > 0', false)).toBe(
      'Crew hp (kit) is at most 3 and hold credits is more than 0',
    );
  });
});
