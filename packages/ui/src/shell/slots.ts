/**
 * The shell's slots as plain functions (M4.3, D53, docs/specs/shell.md#the-title): their names,
 * what each shows, the one Continue loads, and the Daily's number and seed.
 */
import type { SlotSummary } from '@eb/platform';

export const DAILY_SLOT = 'daily';
const NUMBERED = /^slot-([1-9][0-9]*)$/;

/** The numbered slots New offers: slot-1 to slot-<count>. */
export const slotIds = (count: number): string[] => Array.from({ length: count }, (_, i) => `slot-${i + 1}`);

export const isNumbered = (slot: string): boolean => NUMBERED.test(slot);

/** What a slot is called on screen. */
export function slotName(slot: string): string {
  if (slot === DAILY_SLOT) return 'Daily';
  const n = NUMBERED.exec(slot)?.[1];
  return n === undefined ? slot : `Slot ${n}`;
}

/** A slot as the shell lists it: what its summary says, or that it can't be read. */
export type SlotInfo =
  | {
      readonly slot: string;
      readonly readable: true;
      readonly savedAt: number;
      /** The game's slot line, filled as it was saved, or the step. */
      readonly line: string;
      /** The Daily's number, for the Daily slot. */
      readonly daily: number | undefined;
      /** The editor's debug tools changed this game (M4.9, D59): it is never saved out. */
      readonly debugged: boolean;
    }
  | { readonly slot: string; readonly readable: false };

/** A summary's fields read one by one: a slot whose line is missing still shows its step. */
export function slotInfo(summary: SlotSummary): SlotInfo {
  if (!summary.readable) return summary;
  const { line, turn, daily, debug } = summary.summary;
  const shown = typeof line === 'string' ? line : `Step ${typeof turn === 'number' ? turn : 0}`;
  return {
    slot: summary.slot,
    readable: true,
    savedAt: summary.savedAt,
    line: shown,
    daily: Number.isInteger(daily) ? (daily as number) : undefined,
    debugged: typeof debug === 'number' && debug > 0,
  };
}

/**
 * The slot Continue loads: the numbered slot played last. Play saves every step, so that is the
 * newest by its saved time, and `list` comes newest first. None when no numbered slot can be read.
 */
export function continueSlot(list: readonly SlotInfo[]): Extract<SlotInfo, { readable: true }> | undefined {
  for (const info of list) if (info.readable && isNumbered(info.slot)) return info;
  return undefined;
}

// The Daily counts days from here, by the local calendar (Chooser's calendar.ts).
const EPOCH = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;

/** The Daily's number on this local date: days since 2026-01-01. */
export function dailyNumber(date: Date): number {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((local - EPOCH) / DAY);
}

export const dailySeed = (n: number): string => `daily:${n}`;
