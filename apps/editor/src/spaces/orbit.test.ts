import { describe, expect, it } from 'vitest';
import { eyeOf, flownBy, framed, type Orbit, pannedBy, screenAxes, turnedBy, zoomedBy } from './orbit.ts';

const level: Orbit = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 };
const close = (a: readonly number[], b: readonly number[]) => {
  for (const [i, v] of a.entries()) expect(v).toBeCloseTo(b[i] as number);
};

describe('the Scene panel’s camera', () => {
  it('looks at its target from yaw and pitch', () => {
    close(eyeOf(level), [0, 0, 10]);
    close(eyeOf({ ...level, yaw: 90 }), [10, 0, 0]);
    close(eyeOf({ ...level, pitch: 90 }), [0, 10, 0]);
    const { right, up, forward } = screenAxes(level);
    close(right, [1, 0, 0]);
    close(up, [0, 1, 0]);
    close(forward, [0, 0, -1]);
  });

  it('orbits by a drag, never over the top', () => {
    expect(turnedBy(level, 100, 0).yaw).toBeCloseTo(330);
    expect(turnedBy(level, -100, 0).yaw).toBeCloseTo(30);
    expect(turnedBy(level, 0, 1000).pitch).toBe(85);
    expect(turnedBy(level, 0, -1000).pitch).toBe(-85);
  });

  it('pans so the ground under the pointer follows it', () => {
    // 10 m away with a 50° view 500 px tall: about 1.87 cm a pixel.
    const panned = pannedBy(level, 100, 0, 500);
    expect(panned.target[0]).toBeCloseTo(-1.865, 2);
    expect(pannedBy(level, 0, 100, 500).target[1]).toBeCloseTo(1.865, 2);
  });

  it('zooms within reach, flies with the target and frames a ball', () => {
    expect(zoomedBy(level, 2).distance).toBe(5);
    expect(zoomedBy(level, 1000).distance).toBe(0.5);
    expect(zoomedBy(level, 0.0001).distance).toBe(400);
    close(flownBy(level, [0, 0, 1], 2).target, [0, 0, -2]);
    close(flownBy(level, [1, 1, 0], 1).target, [1, 1, 0]);
    const seen = framed(level, [3, 1, 0], 2);
    close(seen.target, [3, 1, 0]);
    expect(seen.distance).toBeCloseTo(2 / Math.sin((25 * Math.PI) / 180) + 0.5);
  });
});
