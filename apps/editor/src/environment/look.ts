/**
 * An environment as the view draws it (M5.4, D66, docs/specs/environments.md#the-sun): every field
 * left out filled in, and the sun, its light and the sky's light worked out from the hour. Plain
 * arithmetic, so the tests hold the numbers and the view only hands them to three.
 */
import { ENVIRONMENT_DEFAULTS, type EnvironmentRecord, type Fog, type Sky, type Weather } from '@eb/schema';

export type Vec3 = readonly [number, number, number];

export interface Sun {
  /** Degrees above the horizon: below 0 at night. */
  readonly height: number;
  /** Degrees from north, clockwise: 90 is east. */
  readonly bearing: number;
  /** Toward the sun, north −z and east +x as the view has them. */
  readonly direction: Vec3;
}

export interface Look {
  readonly sky: Sky;
  readonly turbidity: number;
  readonly zenith: string;
  readonly horizon: string;
  readonly ground: string;
  readonly sun: Sun & { readonly color: string; readonly strength: number };
  readonly skyLight: { readonly color: string; readonly strength: number };
  readonly fog: Fog | null;
  readonly weather: Weather;
  /** How many drops or flakes fall: none without weather. */
  readonly particles: number;
}

/** The sunlight's colour where it lies on the horizon, which it warms toward below WARM_BELOW degrees. */
export const LOW_SUN = '#ff9a4a';
export const WARM_BELOW = 20;
/** The most that fall, at a weather amount of 1. */
export const MOST = { rain: 3000, snow: 2000 } as const;

const DEG = Math.PI / 180;
const held = (n: number) => Math.min(1, Math.max(0, n));

/** Where the hour puts the sun: up at 6 in the east, highest at 12 in the south, down at 18 in the west. */
export function sunAt(hour: number): Sun {
  const height = 60 * Math.sin((Math.PI * (hour - 6)) / 12);
  const bearing = 90 + 15 * (hour - 6);
  const h = height * DEG;
  const b = bearing * DEG;
  return { height, bearing, direction: [Math.cos(h) * Math.sin(b), Math.sin(h), -Math.cos(h) * Math.cos(b)] };
}

/** Two "#rrggbb" colours mixed, `t` of the way from `a` to `b`. */
export function mixColour(a: string, b: string, t: number): string {
  const part = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const channel = (at: number) =>
    Math.round(part(a, at) + (part(b, at) - part(a, at)) * held(t))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** The environment's fields, each left out given its value, and the light the hour makes of them. */
export function lookOf(record: EnvironmentRecord): Look {
  const d = { ...ENVIRONMENT_DEFAULTS, ...record };
  const sun = sunAt(d.hour);
  const up = Math.sin(sun.height * DEG);
  // A sun of no strength is a cave or a room: its sky light is whole at every hour.
  const day = d['sun-strength'] === 0 ? 1 : held(2 * up + 0.4);
  const warm = sun.height < WARM_BELOW ? 1 - Math.max(0, sun.height) / WARM_BELOW : 0;
  const most = d.weather === 'none' ? 0 : MOST[d.weather];
  return {
    sky: d.sky,
    turbidity: d.turbidity,
    zenith: d.zenith,
    horizon: d.horizon,
    ground: d.ground,
    sun: { ...sun, color: mixColour(d.sun, LOW_SUN, warm), strength: d['sun-strength'] * held(2 * up) },
    skyLight: { color: d.ambient, strength: d['ambient-strength'] * (0.2 + 0.8 * day) },
    fog: record.fog ?? null,
    weather: d.weather,
    particles: Math.round(most * d['weather-amount']),
  };
}
