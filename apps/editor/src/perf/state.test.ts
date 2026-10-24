/** Auto's tier as the editor holds it (M5.7, D69): the pick, the step down and the words for why. */
import { beforeEach, describe, expect, it } from 'vitest';
import { autoPick, chooseQuality, quality, stepDown, steppedDown, tierNow, tierReason } from './state.ts';

describe('the tier the view draws at', () => {
  beforeEach(() => {
    chooseQuality('auto');
    autoPick.value = { tier: 'high', reason: 'a computer with 8 cores or more' };
  });

  it('is Auto’s pick from the hints, and says why', () => {
    expect(tierNow.value).toBe('high');
    expect(tierReason.value).toBe('Auto: High (a computer with 8 cores or more)');
  });

  it('steps down one at a time as Auto, never below Low, and says from where', () => {
    stepDown();
    expect(tierNow.value).toBe('medium');
    expect(tierReason.value).toBe('Auto: Medium, stepped down from High');
    stepDown();
    stepDown();
    expect(tierNow.value).toBe('low');
    expect(tierReason.value).toBe('Auto: Low, stepped down from Medium');
  });

  it('never steps while a tier is picked by hand, and a pick forgets a step', () => {
    stepDown();
    chooseQuality('high');
    expect(steppedDown.value).toBeNull();
    stepDown();
    expect(steppedDown.value).toBeNull();
    expect(tierNow.value).toBe('high');
    expect(tierReason.value).toBe('Chosen: High');
    chooseQuality('auto');
    expect(quality.value).toBe('auto');
    expect(tierNow.value).toBe('high');
  });
});
