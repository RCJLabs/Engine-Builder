import { describe, expect, it } from 'vitest';
import { sightGain } from './aware.ts';
import { levelOf } from './types.ts';

describe('a sighting’s gain', () => {
  it('is 8 at arm’s length, down to 2 at the edge of sight, whole numbers', () => {
    expect(sightGain(0, 15)).toBe(8);
    expect(sightGain(100, 15)).toBe(8);
    expect(sightGain(800, 15)).toBe(2 + Math.floor((6 * 700) / 1400));
    expect(sightGain(1500, 15)).toBe(2);
    // The stage sends none past sight; one that slips through counts as at the edge.
    expect(sightGain(4000, 15)).toBe(2);
    expect(sightGain(50, 1)).toBe(8);
  });
});

describe('levels', () => {
  it('are unaware below 30, suspicious from 30, alerted from 70', () => {
    expect([0, 29, 30, 69, 70, 100].map(levelOf)).toEqual([
      'unaware',
      'unaware',
      'suspicious',
      'suspicious',
      'alerted',
      'alerted',
    ]);
  });
});
