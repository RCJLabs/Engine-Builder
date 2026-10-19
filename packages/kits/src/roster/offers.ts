/**
 * Recruits rolled from templates (docs/specs/roster.md#offers). A hall's offer is worked out again
 * from the salt, the hall, its round and the slot each time it is asked for, from a stream made
 * for it and never saved, so a hall offers the same people every visit and only hires are saved
 * (from space-wrecked's src/sim/recruits.js). The order of the draws is part of the save contract.
 */
import { type DeepReadonly, type MadeSpec, type RecordStore, Rng } from '@eb/core';
import { own } from '../own.ts';
import { ACTOR, type ActorRecord } from '../stats/types.ts';
import { actorRecord } from '../stats/values.ts';
import {
  type Fee,
  HALL,
  type HallRecord,
  RECRUIT,
  type RecruitRecord,
  type Rolled,
  type RosterSlice,
} from './types.ts';

/** Draws of a name before one worn by a member now is kept. */
export const NAME_TRIES = 20;

export interface Offer extends Rolled {
  readonly slot: number;
  readonly fee: Fee;
}

function recordOf<T>(content: RecordStore, type: string, id: unknown): T {
  if (typeof id !== 'string' || !content.has(type, id)) throw new Error(`No ${type} "${String(id)}"`);
  return content.get(type, id) as T;
}

export const recruitRecord = (content: RecordStore, id: unknown) => recordOf<RecruitRecord>(content, RECRUIT, id);
export const hallRecord = (content: RecordStore, id: unknown) => recordOf<HallRecord>(content, HALL, id);

function nameOf(template: RecruitRecord, rng: Rng, worn: ReadonlySet<string>): string {
  let name = '';
  for (let i = 0; i < NAME_TRIES; i++) {
    const first = rng.pick(template.names);
    const by = template.bynames && template.bynames.length > 0 ? rng.pick(template.bynames) : undefined;
    name = by === undefined ? first : `${first} ${by}`;
    if (!worn.has(name)) return name;
  }
  return name;
}

/** A recruit rolled from its template with this stream: its name, its stats in id order, then its traits. */
export function roll(template: RecruitRecord, id: string, rng: Rng, worn: ReadonlySet<string>): Rolled {
  const name = nameOf(template, rng, worn);
  const stats: Record<string, number> = {};
  for (const stat of Object.keys(template.stats ?? {}).sort()) {
    const range = template.stats?.[stat] as { min: number; max?: number };
    stats[stat] = rng.int(range.min, range.max ?? range.min);
  }
  const traits: string[] = [];
  for (const trait of template.traits ?? []) {
    if (template.most !== undefined && traits.length >= template.most) break;
    if (rng.chance(trait.chance, 100)) traits.push(trait.status);
  }
  return {
    recruit: id,
    name,
    ...(Object.keys(stats).length > 0 ? { stats } : {}),
    ...(traits.length > 0 ? { traits } : {}),
  };
}

/** What hiring a rolled recruit costs: its template's fee and each drawn trait's, added by resource. */
export function feeOf(template: RecruitRecord, traits: readonly string[] = []): Fee {
  const fee: Record<string, number> = { ...template.fee };
  for (const trait of template.traits ?? []) {
    if (!traits.includes(trait.status)) continue;
    for (const [resource, amount] of Object.entries(trait.fee ?? {})) fee[resource] = (fee[resource] ?? 0) + amount;
  }
  return fee;
}

/** The names worn by members now, which a new recruit's is drawn again to avoid. */
export function wornNames(content: RecordStore, slice: DeepReadonly<RosterSlice>): Set<string> {
  const names = slice.members.map((id) => content.get<ActorRecord>(ACTOR, id)?.name);
  return new Set(names.filter((name): name is string => name !== undefined));
}

/** The round a hall is in: 0 until it is first refreshed. */
export const roundOf = (slice: DeepReadonly<RosterSlice>, hall: string): number => own(slice.halls, hall)?.round ?? 0;

/** The offer in a slot of a hall this round, worked out again from the salt. */
export function offerAt(content: RecordStore, slice: DeepReadonly<RosterSlice>, hall: string, slot: number): Offer {
  const record = hallRecord(content, hall);
  const rng = Rng.create(`${slice.salt}/${hall}/${roundOf(slice, hall)}/${slot}`);
  const from = record.recruits[rng.weightedIndex(record.recruits.map((r) => r.weight ?? 1))];
  if (!from) throw new Error(`Hall "${hall}" offers no recruits`);
  const template = recruitRecord(content, from.recruit);
  const rolled = roll(template, from.recruit, rng, wornNames(content, slice));
  return { ...rolled, slot, fee: feeOf(template, rolled.traits) };
}

/** Who the recruit effect would make next, worked out from the salt and the recruit's number. */
export function nextRecruit(content: RecordStore, slice: DeepReadonly<RosterSlice>, recruit: unknown): Rolled {
  const template = recruitRecord(content, recruit);
  const rng = Rng.create(`${slice.salt}/recruit/${slice.next}`);
  return roll(template, recruit as string, rng, wornNames(content, slice));
}

/** A recruit's id: its template's, a hyphen and its number. */
export const recruitId = (recruit: string, n: number): string => `${recruit}-${n}`;

/**
 * A recruit's record: its template's actor, with the rolled name, stats and traits laid over it.
 * Everything else is the actor's, read from content each time it is made.
 */
export function madeActor(content: RecordStore, rolled: DeepReadonly<Rolled>): ActorRecord {
  const base = actorRecord(content, recruitRecord(content, rolled.recruit).actor);
  const given = base.statuses ?? [];
  const statuses = [...given, ...(rolled.traits ?? []).filter((trait) => !given.includes(trait))];
  const stats = rolled.stats ? { ...base.stats, ...rolled.stats } : base.stats;
  return {
    ...base,
    name: rolled.name,
    ...(stats ? { stats } : {}),
    ...(statuses.length > 0 ? { statuses } : {}),
  };
}

// Built once for each rolled entry while the slice holds it, with the content it was built from:
// a recruit is read many times a turn, and the kernel freezes the object it is handed once.
const built = new WeakMap<object, { readonly content: RecordStore; readonly record: ActorRecord }>();

/** The roster's made records (D44): an actor for every recruit ever made, gone ones too. */
export const MADE: MadeSpec<RosterSlice> = {
  types: [ACTOR],
  ids: ({ state }, type) => (type === ACTOR ? Object.keys(state.made).sort() : []),
  get: ({ state, content }, type, id) => {
    const rolled = type === ACTOR ? own(state.made, id) : undefined;
    if (rolled === undefined) return undefined;
    const hit = built.get(rolled);
    if (hit?.content === content) return hit.record;
    const record = madeActor(content, rolled);
    built.set(rolled, { content, record });
    return record;
  },
};
