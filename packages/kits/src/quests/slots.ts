/**
 * A quest's slots (M3.10, D48, docs/specs/quests.md#slots): filled in order as it starts, by rule;
 * named `@slot` in its fields, which are bound to the slots' records before they are read; named
 * `{slot}` in its texts, which show the records' names as they are now; and gone when a slot's
 * Keeps while stops holding. Since M6.7 (D79) a slot can find a space, an object or an actor in the
 * world (finding.ts), take the nearest, and send a space slot on to its next match.
 */
import type { Condition, DeepReadonly, FactArgs, RecordStore, Truth, WorldPlaces } from '@eb/core';
import { own } from '../own.ts';
import { findsInWorld, OBJECT, placeName, SPACE, spaceOf, stillThere, worldCandidates } from './finding.ts';
import { questRecord } from './records.ts';
import type { QuestEntry, QuestRecord, QuestsSlice, Slot } from './types.ts';

/** What filling and showing read: a module's context, or its preview's, with the pack's places. */
export interface Reader {
  readonly content: RecordStore;
  /** M6.7: what world slots find in, when the game has spaces. */
  readonly places?: WorldPlaces;
  read(): DeepReadonly<QuestsSlice>;
  fact(id: string, args?: FactArgs): unknown;
  check(condition: Condition): Truth;
}

type Filled = Readonly<Record<string, string>>;
type Draw = (n: number) => number;

const SLOT = /^@([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;
const slotOf = (text: string, slots: Filled): string | undefined => {
  const named = SLOT.exec(text);
  return named ? own(slots, named[1] as string) : undefined;
};

function bindValue(value: unknown, slots: Filled): unknown {
  if (typeof value === 'string') return slotOf(value, slots) ?? value;
  if (Array.isArray(value)) return value.map((item) => bindValue(item, slots));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [slotOf(key, slots) ?? key, bindValue(item, slots)]),
  );
}

/** `value` with each "@slot" the slots name, as a value or a key, its record's id; the rest as it was. */
export const bind = <T>(value: T, slots: Filled | undefined): T =>
  slots === undefined ? value : (bindValue(value, slots) as T);

/** Whether the record is in a slot that goes of an active quest: away, and sent on no other. */
export function isAway(reader: Pick<Reader, 'content' | 'read'>, record: string): boolean {
  for (const [id, entry] of Object.entries(reader.read().quests)) {
    if (entry.state !== 'active' || entry.slots === undefined) continue;
    const held = entry.slots;
    const slots = questRecord(reader.content, id).slots ?? [];
    if (slots.some((slot) => slot.goes === true && own(held, slot.id) === record)) return true;
  }
  return false;
}

/** The records of the slot's type that could fill it now, by id; for a world slot, what it finds. */
function matching(reader: Reader, quest: QuestRecord, slot: Slot, filled: Filled): string[] {
  const types = new Map((quest.slots ?? []).map((s) => [s.id, s.type]));
  const taken = new Set(Object.entries(filled).map(([id, value]) => `${types.get(id)}:${value}`));
  const ids = findsInWorld(slot)
    ? reader.places === undefined
      ? []
      : worldCandidates(reader.places, slot, filled, reader)
    : slot.record === undefined
      ? reader.content.ids(slot.type)
      : reader.content.has(slot.type, slot.record)
        ? [slot.record]
        : [];
  return ids.filter(
    (id) =>
      !taken.has(`${slot.type}:${id}`) &&
      !(slot.goes === true && isAway(reader, id)) &&
      (slot.where === undefined || reader.check(bind(slot.where, { ...filled, [slot.id]: id })) === true),
  );
}

/** Nearest: the fewest doors to each thing's space, those no door leads to left out; ties drawn. */
function nearest(reader: Reader, slot: Slot, filled: Filled, ids: string[], draw?: Draw): string | undefined {
  const places = reader.places;
  if (places === undefined) return undefined;
  let best: number | undefined;
  let tied: string[] = [];
  for (const id of ids) {
    const space = spaceOf(places, slot, filled, id);
    const doors = space === undefined ? undefined : reader.fact('world.doors', { space });
    if (typeof doors !== 'number') continue;
    if (best === undefined || doors < best) [best, tied] = [doors, [id]];
    else if (doors === best) tied.push(id);
  }
  return tied.length > 1 && draw ? tied[draw(tied.length)] : tied[0];
}

/** One of the records: the first, one drawn, the most or least by its By, or the nearest; ties to the first. */
function pick(reader: Reader, slot: Slot, filled: Filled, ids: string[], draw?: Draw): string | undefined {
  if (ids.length === 0) return undefined;
  if (slot.pick === 'random') return ids[draw ? draw(ids.length) : 0];
  if (slot.pick === 'nearest') return nearest(reader, slot, filled, ids, draw);
  if ((slot.pick !== 'most' && slot.pick !== 'least') || slot.by === undefined) return ids[0];
  let best: { id: string; value: number } | undefined;
  for (const id of ids) {
    const value = reader.fact(slot.by.fact, bind(slot.by.args ?? {}, { ...filled, [slot.id]: id }) as FactArgs);
    if (typeof value !== 'number') continue;
    if (best === undefined || (slot.pick === 'most' ? value > best.value : value < best.value)) best = { id, value };
  }
  return best?.id;
}

/** A world slot's pick with the last run's tried last: from the others while one of them is picked. */
function pickFresh(reader: Reader, slot: Slot, filled: Filled, ids: string[], last: string | undefined, draw?: Draw) {
  const fresh = last === undefined || !findsInWorld(slot) ? ids : ids.filter((id) => id !== last);
  return (
    (fresh.length > 0 ? pick(reader, slot, filled, fresh, draw) : undefined) ?? pick(reader, slot, filled, ids, draw)
  );
}

export type Fill = { readonly slots: Record<string, string> } | { readonly unfilled: string };

/**
 * Each slot's record, filled in order, or the first slot no record fills. `draw` gives a whole
 * number below n for a slot that picks at random; without it, as a preview fills, the first.
 * `last` is the run before's slots, for a quest that repeats: its world slots try those last. A space
 * slot that another slot is In tries its next match when one after it can't be filled.
 */
export function fillSlots(reader: Reader, quest: QuestRecord, draw?: Draw, last?: Filled): Fill {
  const slots = quest.slots ?? [];
  const fill = (i: number, filled: Filled): Fill => {
    const slot = slots[i];
    if (slot === undefined) return { slots: { ...filled } };
    let ids = matching(reader, quest, slot, filled);
    const again = slot.type === SPACE && slots.some((s, j) => j > i && s.in === `@${slot.id}`);
    let unfilled: string | undefined;
    while (ids.length > 0) {
      const choice = pickFresh(reader, slot, filled, ids, last && own(last, slot.id), draw);
      if (choice === undefined) break;
      const rest = fill(i + 1, { ...filled, [slot.id]: choice });
      if ('slots' in rest || !again) return rest;
      unfilled ??= rest.unfilled;
      ids = ids.filter((id) => id !== choice);
    }
    return { unfilled: unfilled ?? slot.id };
  };
  return fill(0, {});
}

/** The first slot of an active quest whose record is gone, and wasn't gone already this run. */
export function goneSlot(reader: Reader, quest: QuestRecord, entry: DeepReadonly<QuestEntry>): Slot | undefined {
  if (entry.slots === undefined) return undefined;
  for (const slot of quest.slots ?? []) {
    const record = own(entry.slots, slot.id);
    if (record === undefined || entry.lost?.includes(slot.id)) continue;
    const there =
      findsInWorld(slot) && reader.places !== undefined
        ? stillThere(reader.places, reader.content, slot, entry.slots, record)
        : reader.content.has(slot.type, record);
    if (!there) return slot;
    if (slot.keeps !== undefined && reader.check(bind(slot.keeps, entry.slots)) !== true) return slot;
  }
  return undefined;
}

/** A record's name, as a text shows it: its `name`, or its id. */
export function nameOf(content: RecordStore, type: string, id: string): string {
  const value = content.get<Readonly<Record<string, unknown>>>(type, id);
  return typeof value?.name === 'string' && value.name !== '' ? value.name : id;
}

/** What a slot holds, by name: a record's, or since M6.7 a space's or an object's (finding.ts). */
export function slotName(content: RecordStore, places: WorldPlaces | undefined, slot: Slot, slots: Filled): string {
  const held = own(slots, slot.id) as string;
  if ((slot.type === SPACE || slot.type === OBJECT) && places !== undefined)
    return placeName(places, slot, slots, held);
  return nameOf(content, slot.type, held);
}

/** `text` with each `{slot}` its record's name; a `{x}` naming no slot of the quest is left as written (W128). */
export function slotText(
  content: RecordStore,
  quest: QuestRecord,
  slots: Filled | undefined,
  text: string,
  places?: WorldPlaces,
): string {
  if (slots === undefined || !text.includes('{')) return text;
  return text.replace(/\{([^{}]*)\}/g, (written, name: string) => {
    const slot = quest.slots?.find((each) => each.id === name);
    return slot === undefined || own(slots, name) === undefined ? written : slotName(content, places, slot, slots);
  });
}
