import { describe, expect, it } from 'vitest';
import { isTierName, pixelRatioFor, TIER_NAMES, TIERS, tierOf } from './tiers.ts';

describe('tiers', () => {
  it('run low to high, each costing at least what the one before does', () => {
    expect(TIER_NAMES).toEqual(['low', 'medium', 'high']);
    const tiers = TIER_NAMES.map((name) => TIERS[name]);
    for (const [i, tier] of tiers.entries()) {
      expect(tier.name).toBe(TIER_NAMES[i]);
      const before = tiers[i - 1];
      if (!before) continue;
      expect(tier.pixelRatio).toBeGreaterThanOrEqual(before.pixelRatio);
      expect(tier.shadowMap).toBeGreaterThanOrEqual(before.shadowMap);
    }
    expect(TIERS.low.shadowMap).toBe(0);
  });

  it('fall back to medium for a missing or unknown name', () => {
    expect(tierOf('high')).toBe(TIERS.high);
    expect(tierOf(null)).toBe(TIERS.medium);
    expect(tierOf('ultra')).toBe(TIERS.medium);
    expect(tierOf('toString')).toBe(TIERS.medium);
    expect(isTierName('constructor')).toBe(false);
  });

  it('draw at the tier’s pixel ratio or the screen’s, whichever is less', () => {
    expect(pixelRatioFor(TIERS.high, 3)).toBe(2);
    expect(pixelRatioFor(TIERS.high, 1)).toBe(1);
    expect(pixelRatioFor(TIERS.medium, 2.625)).toBe(1.5);
    expect(pixelRatioFor(TIERS.low, 0)).toBe(1);
    expect(pixelRatioFor(TIERS.medium, Number.NaN)).toBe(1);
  });
});
