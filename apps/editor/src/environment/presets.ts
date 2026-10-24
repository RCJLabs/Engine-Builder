/**
 * The seven presets Start from offers above an environment's form (M5.4, D66,
 * docs/specs/environments.md#the-presets). Each is every field but the name: choosing one writes
 * it over the record, keeping its name, as one step of undo.
 */
import type { EnvironmentRecord } from '@eb/schema';

export interface Preset {
  readonly id: string;
  readonly name: string;
  readonly value: Omit<EnvironmentRecord, 'name'>;
}

const fog = (color: string, near: number, far: number) => ({ fog: { color, near, far } });

export const PRESETS: readonly Preset[] = [
  {
    id: 'desert',
    name: 'Desert',
    value: {
      hour: 14,
      sky: 'physical',
      turbidity: 6,
      sun: '#fff0d0',
      'sun-strength': 2.6,
      ambient: '#f2e2c4',
      'ambient-strength': 1.4,
      ...fog('#d9c3a0', 120, 600),
    },
  },
  {
    id: 'coast',
    name: 'Coast',
    value: {
      hour: 9,
      sky: 'physical',
      turbidity: 3,
      sun: '#fff4e0',
      'sun-strength': 2.2,
      ambient: '#dfeaf2',
      'ambient-strength': 1.6,
      ...fog('#b8c8d4', 80, 500),
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    value: {
      hour: 16,
      sky: 'physical',
      turbidity: 4,
      sun: '#fff1d6',
      'sun-strength': 1.8,
      ambient: '#cfe0c4',
      'ambient-strength': 1.4,
      ...fog('#8fa38a', 30, 220),
    },
  },
  {
    id: 'snow',
    name: 'Snow',
    value: {
      hour: 11,
      sky: 'gradient',
      zenith: '#8fb0d0',
      horizon: '#e6eef5',
      ground: '#f4f7fa',
      sun: '#ffffff',
      'sun-strength': 2,
      ambient: '#e8f0f8',
      'ambient-strength': 1.8,
      ...fog('#e6edf3', 20, 160),
      weather: 'snow',
      'weather-amount': 0.6,
    },
  },
  {
    id: 'cave',
    name: 'Cave',
    value: {
      hour: 12,
      sky: 'colour',
      zenith: '#0d0f12',
      'sun-strength': 0,
      ambient: '#8a7f70',
      'ambient-strength': 0.6,
      ...fog('#0d0f12', 5, 60),
    },
  },
  {
    id: 'sci-fi-interior',
    name: 'Sci-fi interior',
    value: {
      hour: 12,
      sky: 'colour',
      zenith: '#10161d',
      'sun-strength': 0,
      ambient: '#cfe3ff',
      'ambient-strength': 1.2,
    },
  },
  {
    id: 'town',
    name: 'Town',
    value: {
      hour: 17.5,
      sky: 'physical',
      turbidity: 4,
      sun: '#ffd8a8',
      'sun-strength': 2,
      ambient: '#d8c8b8',
      'ambient-strength': 1.2,
      ...fog('#c7a88a', 60, 400),
      weather: 'rain',
      'weather-amount': 0.4,
    },
  },
];

/** The record with the preset written over it: its name kept, every other field the preset's. */
export function withPreset(value: unknown, preset: Preset): EnvironmentRecord {
  const name = typeof value === 'object' && value !== null ? (value as { name?: unknown }).name : undefined;
  return { ...(typeof name === 'string' ? { name } : {}), ...preset.value };
}
