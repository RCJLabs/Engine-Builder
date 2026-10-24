/**
 * The view's tier as the editor holds it (M5.7, D69): the Quality picked in the Scene panel's
 * toolbar and whether Stats is shown, both kept per device; Auto's pick from the hints, read once;
 * and a step down, which lasts until the page reloads. tierNow is what the view draws at.
 */
import { computed, signal } from '@preact/signals';
import { type TierPick, tierFromHints } from './hints.ts';
import { readHints } from './readHints.ts';
import { isTierName, lowerTier, TIER_WORDS, type TierName } from './tiers.ts';

/** The localStorage keys. Like every storage key, never renamed (CLAUDE.md). */
export const QUALITY_KEY = 'eb-quality';
export const STATS_KEY = 'eb-perf-stats';

export type Quality = 'auto' | TierName;

const stored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A browser that keeps nothing keeps the choice until the page closes.
  }
};

const first = stored(QUALITY_KEY);
export const quality = signal<Quality>(isTierName(first) ? first : 'auto');
export const statsShown = signal(stored(STATS_KEY) === 'on');
/** Auto's pick from the hints, null until they are read. */
export const autoPick = signal<TierPick | null>(null);
/** Where Auto has stepped down to, and from where, until the page reloads. */
export const steppedDown = signal<{ readonly to: TierName; readonly from: TierName } | null>(null);

export function chooseQuality(next: Quality): void {
  quality.value = next;
  steppedDown.value = null;
  store(QUALITY_KEY, next);
}

export function showStats(on: boolean): void {
  statsShown.value = on;
  store(STATS_KEY, on ? 'on' : 'off');
}

/** The tier drawn now: the one picked, else where Auto stepped down to, else Auto's pick. */
export const tierNow = computed<TierName>(() => {
  if (quality.value !== 'auto') return quality.value;
  return steppedDown.value?.to ?? autoPick.value?.tier ?? 'medium';
});

/** Why the tier is what it is, as the overlay says it. */
export const tierReason = computed(() => {
  const name = TIER_WORDS[tierNow.value];
  if (quality.value !== 'auto') return `Chosen: ${name}`;
  const step = steppedDown.value;
  if (step) return `Auto: ${name}, stepped down from ${TIER_WORDS[step.from]}`;
  return `Auto: ${name} (${autoPick.value?.reason ?? 'reading the device'})`;
});

/** Auto steps down one, when its frames run long. Nothing below Low, nothing while a tier is picked. */
export function stepDown(): void {
  if (quality.value !== 'auto') return;
  const from = tierNow.value;
  const to = lowerTier(from);
  if (to) steppedDown.value = { to, from };
}

let reading: Promise<void> | null = null;
/** The hints read once, as the first 3D view starts. */
export function readAuto(): Promise<void> {
  reading ??= readHints().then((hints) => {
    autoPick.value = tierFromHints(hints);
  });
  return reading;
}
