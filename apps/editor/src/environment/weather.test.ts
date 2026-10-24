/** Rain and snow as they fall (M5.4, D66): in the box around where the camera looks, at their speeds. */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from './look.ts';
import { BOX, DRIFT, dropAt, FALL, seedDrops } from './weather.ts';

const inBox = ([x, y, z]: Vec3, [cx, cy, cz]: Vec3) =>
  Math.abs(x - cx) <= BOX / 2 && Math.abs(z - cz) <= BOX / 2 && y >= cy - BOX / 2 && y < cy + BOX / 2;

describe('falling weather', () => {
  it('starts the same drops every time, spread through the box', () => {
    const seeds = seedDrops(3000);
    expect(seeds).toEqual(seedDrops(3000));
    const ys = Array.from({ length: 3000 }, (_, i) => seeds[i * 3 + 1] as number);
    expect(Math.min(...ys)).toBeLessThan(1);
    expect(Math.max(...ys)).toBeGreaterThan(BOX - 1);
    const left = Array.from({ length: 3000 }, (_, i) => seeds[i * 3] as number).filter((x) => x < 0).length;
    expect(left).toBeGreaterThan(1350);
    expect(left).toBeLessThan(1650);
  });

  it('keeps every drop in the box around where the camera looks, wherever that is and whenever', () => {
    const seeds = seedDrops(500);
    for (const centre of [
      [0, 0, 0],
      [123.4, 8, -77],
      [-2000, -40, 5000],
    ] as Vec3[]) {
      for (const seconds of [0, 0.5, 7.25, 1000]) {
        for (let i = 0; i < 500; i++) {
          expect(inBox(dropAt(seeds, i, 'rain', seconds, centre), centre)).toBe(true);
          expect(inBox(dropAt(seeds, i, 'snow', seconds, centre), centre)).toBe(true);
        }
      }
    }
  });

  it('falls 9 m a second as rain and 1 m as snow, back in at the top', () => {
    // The spec's speeds, not the constant's, so a changed speed is seen.
    const speed = { rain: 9, snow: 1 } as const;
    expect(FALL).toEqual(speed);
    const seeds = seedDrops(200);
    const centre: Vec3 = [0, 0, 0];
    for (let i = 0; i < 200; i++) {
      for (const kind of ['rain', 'snow'] as const) {
        const [, before] = dropAt(seeds, i, kind, 3, centre);
        const [, after] = dropAt(seeds, i, kind, 3.5, centre);
        const fallen = (((before - after) % BOX) + BOX) % BOX;
        expect(fallen).toBeCloseTo(speed[kind] / 2, 4);
      }
      // Rain falls straight; snow drifts, but no further than its drift.
      expect(dropAt(seeds, i, 'rain', 3, centre)[0]).toBeCloseTo(dropAt(seeds, i, 'rain', 9, centre)[0], 4);
      const sideways = Math.abs(dropAt(seeds, i, 'snow', 3, centre)[0] - dropAt(seeds, i, 'snow', 9, centre)[0]);
      expect(sideways <= 2 * DRIFT + 1e-6 || sideways >= BOX - 2 * DRIFT - 1e-6).toBe(true);
    }
  });

  it('leaves a drop where it is as the camera moves a little, so none jumps in view', () => {
    const seeds = seedDrops(200);
    let kept = 0;
    for (let i = 0; i < 200; i++) {
      const a = dropAt(seeds, i, 'rain', 2, [0, 0, 0]);
      const b = dropAt(seeds, i, 'rain', 2, [3, 0, -2]);
      if (inBox(a, [3, 0, -2]) && Math.abs(a[1]) < BOX / 2 - 1) {
        expect(b[0]).toBeCloseTo(a[0], 4);
        expect(b[2]).toBeCloseTo(a[2], 4);
        kept++;
      }
    }
    expect(kept).toBeGreaterThan(150);
  });
});
