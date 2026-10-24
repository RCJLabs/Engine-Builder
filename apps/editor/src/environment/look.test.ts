/** The sun, its light and the sky's light from the hour (M5.4, D66, docs/specs/environments.md#the-sun). */
import { describe, expect, it } from 'vitest';
import { LOW_SUN, lookOf, MOST, mixColour, sunAt, type Vec3 } from './look.ts';

const near = (a: Vec3, b: Vec3) => {
  for (const [i, n] of a.entries()) expect(n).toBeCloseTo(b[i] as number, 6);
};

describe('the sun', () => {
  it('rises due east at 6, stands highest in the south at 12, and sets due west at 18', () => {
    expect(sunAt(6)).toMatchObject({ height: 0, bearing: 90 });
    near(sunAt(6).direction, [1, 0, 0]);
    expect(sunAt(12).height).toBeCloseTo(60, 9);
    expect(sunAt(12).bearing).toBe(180);
    near(sunAt(12).direction, [0, Math.sqrt(3) / 2, 0.5]);
    expect(sunAt(18).height).toBeCloseTo(0, 9);
    near(sunAt(18).direction, [-1, 0, 0]);
  });

  it('sweeps 15° an hour, and is below the horizon in the north at midnight', () => {
    expect(sunAt(9).bearing - sunAt(8).bearing).toBe(15);
    expect(sunAt(9).height).toBeCloseTo(60 * Math.sin(Math.PI / 4), 9);
    expect(sunAt(0).height).toBeCloseTo(-60, 9);
    near(sunAt(0).direction, [0, -Math.sqrt(3) / 2, -0.5]);
    expect(sunAt(24).height).toBeCloseTo(-60, 9);
  });
});

describe('an environment’s look', () => {
  it('gives every field left out its value: noon under a clear physical sky', () => {
    const look = lookOf({});
    expect(look).toMatchObject({
      sky: 'physical',
      turbidity: 2,
      zenith: '#3a6ea5',
      horizon: '#c9d6df',
      ground: '#5b5346',
      fog: null,
      weather: 'none',
      particles: 0,
    });
    expect(look.sun.color).toBe('#fff4e0');
    expect(look.sun.strength).toBeCloseTo(2.2, 9);
    expect(look.skyLight).toEqual({ color: '#ffffff', strength: 1.6 });
  });

  it('is lower, warmer and dimmer at dawn', () => {
    const noon = lookOf({});
    const dawn = lookOf({ hour: 7 });
    const height = 60 * Math.sin(Math.PI / 12);
    expect(dawn.sun.height).toBeCloseTo(height, 9);
    expect(dawn.sun.strength).toBeCloseTo(2.2 * 2 * Math.sin((height * Math.PI) / 180), 9);
    expect(dawn.sun.color).toBe(mixColour('#fff4e0', LOW_SUN, 1 - height / 20));
    const blue = (hex: string) => Number.parseInt(hex.slice(5, 7), 16);
    expect(blue(dawn.sun.color)).toBeLessThan(blue(noon.sun.color));
    expect(dawn.sun.strength).toBeLessThan(noon.sun.strength);
    expect(dawn.sun.direction[1]).toBeLessThan(noon.sun.direction[1]);
  });

  it('has no sunlight at night, and a fifth of its sky light', () => {
    const night = lookOf({ hour: 2, 'ambient-strength': 2 });
    expect(night.sun.strength).toBe(0);
    expect(night.skyLight.strength).toBeCloseTo(0.4, 9);
    // Twilight: the sky light falls from whole at 17.5° up to a fifth at 11.5° down.
    expect(lookOf({ hour: 6 }).skyLight.strength).toBeCloseTo(1.6 * (0.2 + 0.8 * 0.4), 9);
  });

  it('without a sun has its sky light whole at every hour', () => {
    const cave = lookOf({ hour: 0, 'sun-strength': 0, 'ambient-strength': 0.6 });
    expect(cave.sun.strength).toBe(0);
    expect(cave.skyLight.strength).toBeCloseTo(0.6, 9);
  });

  it('lets fall weather by its amount', () => {
    expect(lookOf({ weather: 'rain' }).particles).toBe(MOST.rain / 2);
    expect(lookOf({ weather: 'snow', 'weather-amount': 1 }).particles).toBe(MOST.snow);
    expect(lookOf({ weather: 'snow', 'weather-amount': 0.6 }).particles).toBe(1200);
    expect(lookOf({ weather: 'none', 'weather-amount': 1 }).particles).toBe(0);
    expect(lookOf({ fog: { color: '#808080', near: 1, far: 9 } }).fog).toEqual({ color: '#808080', near: 1, far: 9 });
  });
});

describe('mixColour', () => {
  it('mixes each channel, held between the two', () => {
    expect(mixColour('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColour('#ff0000', '#0000ff', 0.25)).toBe('#bf0040');
    expect(mixColour('#123456', '#abcdef', 0)).toBe('#123456');
    expect(mixColour('#123456', '#abcdef', 2)).toBe('#abcdef');
  });
});
