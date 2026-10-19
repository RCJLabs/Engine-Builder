/**
 * Bonds (docs/specs/roster.md#bonds): a whole number for each pair of actors, within the roster's
 * bounds and in its bands, changed only by effects (D44). Saved only while it differs from the
 * start, keyed by the two ids sorted and joined by "|", as a faction's standing is saved.
 */
import type { DeepReadonly, Effect, ModuleContext, RecordStore } from '@eb/core';
import { bandAt, withinBounds } from '../bands.ts';
import { actorRecord } from '../stats/values.ts';
import { rosterRecord } from './members.ts';
import type { BondSettings, RosterSlice } from './types.ts';

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const settingsOf = (content: RecordStore): BondSettings => rosterRecord(content)?.bonds ?? {};

/** Where every bond begins: the roster's start, or 0, kept within its bounds. */
export const bondStart = (settings: BondSettings): number => withinBounds(settings, settings.start ?? 0);

// Validation stops content naming a missing actor or one twice (E005, E035): a game's own code throws.
function checkPair(content: RecordStore, a: unknown, b: unknown): void {
  actorRecord(content, a);
  actorRecord(content, b);
  if (a === b) throw new Error(`"${String(a)}" has no bond with itself`);
}

export function bondOf(content: RecordStore, slice: DeepReadonly<RosterSlice>, a: unknown, b: unknown): number {
  checkPair(content, a, b);
  const settings = settingsOf(content);
  return withinBounds(settings, slice.bonds[pairKey(a as string, b as string)] ?? bondStart(settings));
}

/** The band a pair's bond is in, or undefined with no bands. */
export const bondBandOf = (content: RecordStore, slice: DeepReadonly<RosterSlice>, a: unknown, b: unknown) =>
  bandAt(settingsOf(content).bands, bondOf(content, slice, a, b))?.id;

/** What a change-bond would do: the bond before and after, and its band before and after when bonds have bands. */
export function bondPreview(content: RecordStore, slice: DeepReadonly<RosterSlice>, effect: Effect) {
  const { actor, with: other, by } = effect;
  const settings = settingsOf(content);
  const from = bondOf(content, slice, actor, other);
  const to = Number.isSafeInteger(by) ? withinBounds(settings, from + (by as number)) : from;
  const bands = settings.bands ?? [];
  const band = { from: bandAt(bands, from)?.id, to: bandAt(bands, to)?.id };
  return { actor, with: other, from, to, ...(bands.length > 0 ? { band } : {}) };
}

/**
 * Moves a pair's bond by `by`, within the bounds, then says by how much it moved, if it did, and
 * whether its band changed, as change-standing does.
 */
export function changeBond(ctx: ModuleContext<RosterSlice>, a: unknown, b: unknown, by: unknown): void {
  if (!Number.isSafeInteger(by)) throw new Error('change-bond: "by" is a whole number');
  const settings = settingsOf(ctx.content);
  const from = bondOf(ctx.content, ctx.read(), a, b);
  const sum = from + (by as number);
  if (!Number.isSafeInteger(sum)) throw new Error(`A bond of ${sum} is past what the engine counts exactly`);
  const to = withinBounds(settings, sum);
  if (to === from) return;
  const key = pairKey(a as string, b as string);
  const bonds = ctx.write().bonds as Record<string, number>;
  if (to === bondStart(settings)) delete bonds[key];
  else bonds[key] = to;
  ctx.emit('bond-changed', { actor: a, with: b, by: to - from, to });
  const before = bandAt(settings.bands, from)?.id;
  const after = bandAt(settings.bands, to)?.id;
  if (before !== after) ctx.emit('bond-band-changed', { actor: a, with: b, from: before, to: after });
}

/** Every pair of members now, in id order, moved by `by`: Wasteland's fight won together, Ludus's week. */
export function changeBonds(ctx: ModuleContext<RosterSlice>, by: unknown): void {
  const members = [...ctx.read().members].sort();
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) changeBond(ctx, members[i], members[j], by);
  }
}
