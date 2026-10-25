/** The tiers, Auto's hints and its step down (M5.7, D69), as plain functions. */
import { describe, expect, it } from 'vitest';
import { frameStats, percentile } from './frames.ts';
import { tierFromHints } from './hints.ts';
import { createFrameClock, LONG_FRAME, WARM_UP, WINDOW } from './stepDown.ts';
import { lowerTier, pixelRatioOf, TIER_NAMES, TIERS } from './tiers.ts';

describe('the tiers', () => {
  it('spend more at each step up, never less', () => {
    const [low, medium, high] = TIER_NAMES.map((name) => TIERS[name]);
    for (const [a, b] of [
      [low, medium],
      [medium, high],
    ] as const) {
      expect(b?.pixelRatioMost).toBeGreaterThan(a?.pixelRatioMost ?? 0);
      expect(b?.shadowMap).toBeGreaterThan(a?.shadowMap ?? 0);
      expect(b?.foliageReach).toBeGreaterThan(a?.foliageReach ?? 0);
      expect(b?.foliageShare).toBeGreaterThan(a?.foliageShare ?? 0);
      expect(b?.weatherShare).toBeGreaterThan(a?.weatherShare ?? 0);
      expect(b?.viewDistance).toBeGreaterThan(a?.viewDistance ?? 0);
    }
    expect(high).toMatchObject({ antialias: true, foliageShadows: true, physicalSky: true, foliageShare: 1 });
    expect(low).toMatchObject({ antialias: false, shadowMap: 0, physicalSky: false });
  });

  it('draw at the device’s pixel ratio, at most the tier’s', () => {
    expect(pixelRatioOf(TIERS.high, 3)).toBe(2);
    expect(pixelRatioOf(TIERS.medium, 3)).toBe(1.5);
    expect(pixelRatioOf(TIERS.medium, 1)).toBe(1);
    expect(pixelRatioOf(TIERS.low, 2.75)).toBe(1);
    expect(pixelRatioOf(TIERS.high, 0)).toBe(1);
  });

  it('step down one at a time, and not below Low', () => {
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBeNull();
  });
});

describe('Auto’s hints', () => {
  const computer = { gpu: 'ANGLE (NVIDIA GeForce RTX 3060)', memory: 8, cores: 8, coarse: false };

  it('give a software renderer Low, whatever else the device says', () => {
    expect(tierFromHints({ ...computer, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' })).toEqual({
      tier: 'low',
      reason: 'a software renderer',
    });
    expect(tierFromHints({ ...computer, gpu: 'llvmpipe (LLVM 15.0.7, 256 bits)' }).tier).toBe('low');
  });

  it('give a phone Medium, or Low for a GPU the table names', () => {
    const phone = { gpu: 'Adreno (TM) 740', memory: 8, cores: 8, coarse: true };
    expect(tierFromHints(phone)).toEqual({ tier: 'medium', reason: 'a phone or a tablet' });
    for (const gpu of ['Mali-G52', 'Adreno (TM) 610', 'Adreno (TM) 506', 'PowerVR Rogue GE8320', 'Mali-T860']) {
      expect(tierFromHints({ ...phone, gpu }), gpu).toEqual({ tier: 'low', reason: 'a low-end phone GPU' });
    }
    expect(tierFromHints({ ...phone, gpu: 'Mali-G710' }).tier).toBe('medium');
    expect(tierFromHints({ ...phone, gpu: null }).tier).toBe('medium');
  });

  it('give a computer High with 8 cores and 8 GB, or with 8 cores where memory isn’t said', () => {
    expect(tierFromHints(computer).tier).toBe('high');
    expect(tierFromHints({ ...computer, memory: null }).tier).toBe('high');
    expect(tierFromHints({ ...computer, cores: 4 }).tier).toBe('medium');
    expect(tierFromHints({ ...computer, memory: 4 }).tier).toBe('medium');
    expect(tierFromHints({ ...computer, cores: null }).tier).toBe('medium');
  });
});

describe('frame times', () => {
  it('give the median and the 95th percentile by the nearest rank, and the frame rate', () => {
    const intervals = Array.from({ length: 20 }, (_, n) => n + 1);
    expect(percentile([...intervals], 95)).toBe(19);
    expect(frameStats(intervals)).toEqual({ count: 20, fps: 95.2, median: 10, p95: 19 });
    expect(frameStats([])).toEqual({ count: 0, fps: 0, median: 0, p95: 0 });
    // To a tenth of a millisecond, as the overlay shows them.
    expect(frameStats([33.30000000000018, 16.69999999999891])).toMatchObject({ median: 16.7, p95: 33.3 });
  });
});

describe('Auto’s step down', () => {
  /** Frames every `ms` from `from`, back to back, as many as `n`; whether any asked for a step. */
  const run = (clock: ReturnType<typeof createFrameClock>, from: number, ms: number, n: number) => {
    const steps: number[] = [];
    for (let k = 0; k < n; k++) if (clock.frame(from + k * ms, true)) steps.push(k);
    return steps;
  };

  it('never steps for frames under 50 ms, however many', () => {
    expect(run(createFrameClock(), 0, LONG_FRAME - 5, 400)).toEqual([]);
  });

  it('steps once 3 seconds of long frames are drawn past the warm-up, then counts afresh', () => {
    const clock = createFrameClock();
    const steps = run(clock, 0, 80, 150);
    // Frames from 2 s on are judged: the first step once the window holds 3 s of them, the next
    // after 3 s more.
    const window = Math.ceil(WINDOW / 80);
    const first = Math.ceil(WARM_UP / 80) + window - 1;
    expect(steps[0]).toBe(first);
    expect(steps[1]).toBe(first + window);
  });

  it('lets a new view’s first 2 seconds by, while three compiles its shaders', () => {
    const clock = createFrameClock();
    let at = 0;
    const steps: number[] = [];
    // Six 300 ms frames, as a view's first were in software WebGL, then 3.6 s of 30 ms ones: without
    // the warm-up, a window of 3 s would hold six long frames in 46.
    for (let k = 0; k < 6 + 120; k++) {
      at += k < 6 ? 300 : 30;
      if (clock.frame(at, true)) steps.push(k);
    }
    expect(steps).toEqual([]);
    expect(clock.intervals()).toHaveLength(120);
  });

  it('never counts the time between frames drawn apart', () => {
    const clock = createFrameClock();
    for (let k = 0; k < 100; k++) expect(clock.frame(k * 500, false)).toBe(false);
    expect(clock.intervals()).toEqual([]);
  });

  it('takes a few long frames among many short ones in its stride, by the 95th percentile', () => {
    const clock = createFrameClock();
    let at = 0;
    const steps: number[] = [];
    for (let k = 0; k < 400; k++) {
      // A 200 ms hitch every 50th frame: 2% of them, under the 5% the percentile lets by.
      at += k % 50 === 0 ? 200 : 16;
      if (clock.frame(at, true)) steps.push(k);
    }
    expect(steps).toEqual([]);
  });

  it('steps when long frames fill enough of the last 3 seconds, after a while of short ones', () => {
    const clock = createFrameClock();
    let at = 0;
    for (let k = 0; k < 400; k++) {
      at += 16;
      clock.frame(at, true);
    }
    // 2.5 s of 100 ms frames: within the window, over 5% of it, so a step.
    const steps: number[] = [];
    for (let k = 0; k < 25; k++) {
      at += 100;
      if (clock.frame(at, true)) steps.push(k);
    }
    expect(steps.length).toBe(1);
  });

  it('keeps the last 120 intervals for the overlay', () => {
    const clock = createFrameClock();
    run(clock, 0, 16, 300);
    expect(clock.intervals()).toHaveLength(120);
    expect(clock.intervals().every((n) => n === 16)).toBe(true);
  });
});
