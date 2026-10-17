import { describe, expect, it } from 'vitest';
import { heightAt, makeHeightmap } from './heightmap.ts';
import { cameraAt, walkerAt } from './motion.ts';

const map = makeHeightmap('spike-3d');
const TIMES = [0, 7.5, 30, 100, 400];

describe('walkerAt', () => {
  it('walks on the ground at 1.6 units a second, facing the way it goes', () => {
    for (const t of TIMES) {
      const now = walkerAt(map, t);
      const soon = walkerAt(map, t + 0.01);
      expect(now.y).toBe(heightAt(map, now.x, now.z));
      const [dx, dz] = [soon.x - now.x, soon.z - now.z];
      const step = Math.hypot(dx, dz);
      expect(step / 0.01).toBeCloseTo(1.6, 3);
      // three turns a model's forward (+z) to (sin h, cos h) for a heading h about +y.
      expect((Math.sin(now.heading) * dx + Math.cos(now.heading) * dz) / step).toBeCloseTo(1, 3);
    }
  });
});

describe('cameraAt', () => {
  it('circles 13 out from the character, above it and clear of the ground', () => {
    let lifted = 0;
    for (let t = 0; t < 600; t += 0.5) {
      const target = walkerAt(map, t);
      const eye = cameraAt(map, t, target);
      const clear = heightAt(map, eye.x, eye.z) + 2.5;
      expect(Math.hypot(eye.x - target.x, eye.z - target.z)).toBeCloseTo(13, 9);
      expect(eye.y).toBeGreaterThanOrEqual(target.y + 6);
      expect(eye.y).toBeGreaterThanOrEqual(clear);
      if (clear > target.y + 6) lifted++;
    }
    // The walk passes hills where the ground under the camera, not the character, sets its height.
    expect(lifted).toBeGreaterThan(0);
  });
});
