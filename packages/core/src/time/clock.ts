/**
 * The game clock in a walked space (M6.3, D75, docs/specs/ai.md#the-clock): game seconds a real
 * second, which the time kit turns into real milliseconds a tick for time/elapse.
 */

/** project.json's `clock`, and the pack project's from format 12. */
export interface ClockDef {
  /** Game seconds a real second, a whole number from 1 to MAX_RATE once packed: 0 stops the clock and isn't packed. */
  readonly rate: number;
}

/** The rate a project with the time kit and a space runs at when project.json gives no clock: Skyrim's. */
export const DEFAULT_RATE = 20;
export const MAX_RATE = 3600;
/** The most one time/elapse counts: the walk sends one a second, so a longer one is a stage gone wrong. */
export const ELAPSE_CAP_MS = 2000;

const DAY_MS = 86_400_000;

/**
 * Real milliseconds a tick at this rate, or undefined when a tick isn't a whole number of them
 * (E080, W149) or the rate stops the clock. Whole numbers keep elapses the same on every device.
 */
export function msPerTickAt(ticksPerDay: number, rate: number): number | undefined {
  if (!Number.isSafeInteger(ticksPerDay) || ticksPerDay < 1) return undefined;
  if (!Number.isSafeInteger(rate) || rate < 1 || rate > MAX_RATE) return undefined;
  const per = ticksPerDay * rate;
  return DAY_MS % per === 0 ? DAY_MS / per : undefined;
}
