import { describe, expect, it } from 'vitest';
import { MAX_RATE, msPerTickAt } from './clock.ts';

describe('msPerTickAt', () => {
  it('gives the real milliseconds a tick lasts at a rate, when they are whole', () => {
    // A tick a minute at 20x: a game day in 72 real minutes, a tick every 3 s.
    expect(msPerTickAt(1440, 20)).toBe(3000);
    // The time kit's own calendar, a tick a day: every 72 minutes.
    expect(msPerTickAt(1, 20)).toBe(4_320_000);
    expect(msPerTickAt(24, 1)).toBe(3_600_000);
    expect(msPerTickAt(24, MAX_RATE)).toBe(1000);
  });

  it('gives nothing when a tick is not a whole number of milliseconds, or the rate stops the clock', () => {
    expect(msPerTickAt(1440, 7)).toBeUndefined();
    expect(msPerTickAt(7, 20)).toBeUndefined();
    expect(msPerTickAt(1440, 0)).toBeUndefined();
    expect(msPerTickAt(1440, MAX_RATE + 1)).toBeUndefined();
    expect(msPerTickAt(1440, 2.5)).toBeUndefined();
    expect(msPerTickAt(0, 20)).toBeUndefined();
    // A tick a second at 3,600x would be shorter than a millisecond.
    expect(msPerTickAt(86_400, MAX_RATE)).toBeUndefined();
  });
});
