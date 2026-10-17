import { describe, expect, it } from 'vitest';
import { FrameWindow, frameStats } from './frames.ts';

describe('frameStats', () => {
  it('is null with no frames', () => {
    expect(frameStats([])).toBeNull();
  });

  it('takes each figure from a frame that happened, by nearest rank', () => {
    const deltas = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(frameStats(deltas)).toEqual({
      frames: 100,
      seconds: 5.05,
      fps: 100_000 / 5050,
      medianMs: 50,
      p95Ms: 95,
      worstMs: 100,
    });
    expect(frameStats([16, 50, 16, 16])).toMatchObject({ medianMs: 16, p95Ms: 50, worstMs: 50 });
    expect(frameStats([20])).toMatchObject({ fps: 50, medianMs: 20, p95Ms: 20, worstMs: 20 });
  });

  it('shows a stutter the frame rate hides', () => {
    const smooth = frameStats(Array(60).fill(16.7));
    const hitched = frameStats([...Array(57).fill(15), 50, 50, 50]);
    expect(Math.abs((smooth?.fps ?? 0) - (hitched?.fps ?? 0))).toBeLessThan(2);
    expect(hitched?.worstMs).toBe(50);
    expect(smooth?.worstMs).toBe(16.7);
  });
});

describe('FrameWindow', () => {
  it('keeps the frames of the last window', () => {
    const recent = new FrameWindow(1000);
    for (let now = 0; now <= 3000; now += 10) recent.add(now);
    const deltas = recent.deltas();
    expect(deltas).toHaveLength(100);
    expect(new Set(deltas)).toEqual(new Set([10]));
  });

  it('keeps two frames however slow, so one long frame still shows', () => {
    const recent = new FrameWindow(1000);
    recent.add(0);
    recent.add(5000);
    expect(recent.deltas()).toEqual([5000]);
  });
});
