/**
 * Standing and its bands (docs/specs/factions.md): a whole number within the faction's own
 * bounds, read from content each time so a content update to a start or a band reaches a save.
 * Space-Wrecked's levels and Landnam's bands are both "the last band passed".
 */
import type { DeepReadonly, ModuleContext, RecordStore } from '@eb/core';
import { type Band, FACTION, type FactionRecord, type FactionsSlice } from './types.ts';

/** The record, or a thrown error: validation stops a reference to a missing one. */
export function factionRecord(content: RecordStore, id: unknown): FactionRecord {
  if (typeof id !== 'string' || !content.has(FACTION, id)) throw new Error(`No faction "${String(id)}"`);
  return content.get(FACTION, id) as FactionRecord;
}

/** `n` kept within the faction's bounds. */
export const within = (faction: FactionRecord, n: number): number =>
  Math.min(Math.max(n, faction.min ?? Number.NEGATIVE_INFINITY), faction.max ?? Number.POSITIVE_INFINITY);

/** Where standing begins: the faction's start, or 0 kept within its bounds. */
export const startOf = (faction: FactionRecord): number => faction.start ?? within(faction, 0);

/** The standing now: the slice's when it holds one, else the start, kept within the bounds either way. */
export function standingOf(content: RecordStore, slice: DeepReadonly<FactionsSlice>, id: string): number {
  const faction = factionRecord(content, id);
  return within(faction, slice.standing[id] ?? startOf(faction));
}

/** The band a standing is in: the last whose start it has reached, the first holding everything below. */
export function bandOf(faction: FactionRecord, standing: number): Band | undefined {
  const bands = faction.bands ?? [];
  let found = bands[0];
  for (const band of bands.slice(1)) if (band.from !== undefined && band.from <= standing) found = band;
  return found;
}

/** Whether a standing is at or above where the band begins: the first band holds everything below. */
export function reached(faction: FactionRecord, id: string, band: unknown, standing: number): boolean {
  const bands = faction.bands ?? [];
  const index = bands.findIndex((b) => b.id === band);
  if (index === -1) throw new Error(`Faction "${id}" has no band "${String(band)}"`);
  const from = (bands[index] as Band).from;
  return index === 0 || (from !== undefined && standing >= from);
}

/** The share of a shop's prices the faction's band sets, percent: 100 with no bands. */
export const priceOf = (faction: FactionRecord, standing: number): number => bandOf(faction, standing)?.price ?? 100;

/**
 * Moves a standing by `by`, within the bounds. Says by how much it moved, if it did, then whether
 * the band changed. The slice keeps only a standing that differs from the start.
 */
export function changeStanding(ctx: ModuleContext<FactionsSlice>, id: string, by: unknown): void {
  const faction = factionRecord(ctx.content, id);
  if (!Number.isSafeInteger(by)) throw new Error('change-standing: "by" is a whole number');
  const from = standingOf(ctx.content, ctx.read(), id);
  const sum = from + (by as number);
  if (!Number.isSafeInteger(sum)) throw new Error(`A standing of ${sum} is past what the engine counts exactly`);
  const to = within(faction, sum);
  if (to === from) return;
  const standing = ctx.write().standing as Record<string, number>;
  if (to === startOf(faction)) delete standing[id];
  else standing[id] = to;
  ctx.emit('standing-changed', { faction: id, by: to - from, to });
  const before = bandOf(faction, from)?.id;
  const after = bandOf(faction, to)?.id;
  if (before !== after) ctx.emit('band-changed', { faction: id, from: before, to: after });
}

/** One point toward each drifting faction's resting value on the days it drifts, in id order. */
export function drift(ctx: ModuleContext<FactionsSlice>, day: number): void {
  for (const id of ctx.content.ids(FACTION)) {
    const faction = factionRecord(ctx.content, id);
    if (faction.drift === undefined || day % faction.drift.every !== 0) continue;
    const rest = within(faction, faction.drift.toward ?? startOf(faction));
    const now = standingOf(ctx.content, ctx.read(), id);
    if (now !== rest) changeStanding(ctx, id, now < rest ? 1 : -1);
  }
}
