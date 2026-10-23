/**
 * What an ambience's or a music's preview plays (M4.8, D58), as plain functions: each part the
 * game's mix sets a level for, and the mix with the ticked conditions held.
 */
import type { Mix } from '@eb/ui/audio';
import { MUSIC } from '@eb/ui/format';

export interface Part {
  readonly key: string;
  readonly label: string;
  readonly when?: string;
  readonly gain: number;
}

export const list = (value: unknown, key: string): Record<string, unknown>[] => {
  const held = (value as Record<string, unknown> | null)?.[key];
  return Array.isArray(held)
    ? held.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    : [];
};
const whenOf = (part: Record<string, unknown>) =>
  typeof part.when === 'string' && part.when !== '' ? part.when : undefined;

/** Each part of the record the mix sets a level for, as the game's mix keys it. */
export function partsOf(type: string, value: unknown): Part[] {
  if (type === MUSIC) {
    return list(value, 'stems').map((stem, n) => ({
      key: `stem/${n}`,
      label: `Stem ${n + 1}`,
      gain: typeof stem.gain === 'number' ? stem.gain : 1,
      ...(whenOf(stem) ? { when: whenOf(stem) } : {}),
    }));
  }
  return [
    ...list(value, 'layers').map((layer, n) => ({
      key: `layer/${n}`,
      label: `Layer ${n + 1}`,
      gain: 1,
      ...(whenOf(layer) ? { when: whenOf(layer) } : {}),
    })),
    ...list(value, 'now-and-then').map((then, n) => ({
      key: `then/${n}`,
      label: `Now and then ${n + 1}`,
      gain: 1,
      ...(whenOf(then) ? { when: whenOf(then) } : {}),
    })),
  ];
}

/** The mix the preview plays: every part without a condition, and those with one that are ticked. */
export function previewMix(type: string, id: string, parts: readonly Part[], ticked: ReadonlySet<string>): Mix {
  const levels = Object.fromEntries(parts.map((p) => [p.key, p.when === undefined || ticked.has(p.key) ? p.gain : 0]));
  return type === MUSIC ? { music: id, levels } : { ambience: id, levels };
}
