/**
 * A quest's slots (M3.10, D48, docs/specs/quests.md#slots): filled in order as it starts, by rule;
 * named `@slot` in its fields, which are bound to the slots' records before they are read; named
 * `{slot}` in its texts, which show the records' names as they are now; and gone when a slot's
 * Keeps while stops holding.
 */
import type { Condition, DeepReadonly, FactArgs, RecordStore, Truth } from '@eb/core';
import { own } from '../own.ts';
import { questRecord } from './records.ts';
import type { QuestEntry, QuestRecord, QuestsSlice, Slot } from './types.ts';

/** What filling and showing read: a module's context, or its preview's. */
export interface Reader {
  readonly content: RecordStore;
  read(): DeepReadonly<QuestsSlice>;
  fact(id: string, args?: FactArgs): unknown;
  check(condition: Condition): Truth;
}

type Filled = Readonly<Record<string, string>>;

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

/** The records of the slot's type that could fill it now, by id. */
function matching(reader: Reader, slot: Slot, filled: Filled): string[] {
  const taken = new Set(Object.values(filled));
  const ids =
    slot.record === undefined
      ? reader.content.ids(slot.type)
      : reader.content.has(slot.type, slot.record)
        ? [slot.record]
        : [];
  return ids.filter(
    (id) =>
      !taken.has(id) &&
      !(slot.goes === true && isAway(reader, id)) &&
      (slot.where === undefined || reader.check(bind(slot.where, { ...filled, [slot.id]: id })) === true),
  );
}

/** One of the records: the first, one drawn, or the most or least by its By, ties to the first. */
function pick(reader: Reader, slot: Slot, filled: Filled, ids: string[], draw?: (n: number) => number) {
  if (ids.length === 0) return undefined;
  if (slot.pick === 'random') return ids[draw ? draw(ids.length) : 0];
  if ((slot.pick !== 'most' && slot.pick !== 'least') || slot.by === undefined) return ids[0];
  let best: { id: string; value: number } | undefined;
  for (const id of ids) {
    const value = reader.fact(slot.by.fact, bind(slot.by.args ?? {}, { ...filled, [slot.id]: id }) as FactArgs);
    if (typeof value !== 'number') continue;
    if (best === undefined || (slot.pick === 'most' ? value > best.value : value < best.value)) best = { id, value };
  }
  return best?.id;
}

export type Fill = { readonly slots: Record<string, string> } | { readonly unfilled: string };

/**
 * Each slot's record, filled in order, or the first slot no record fills. `draw` gives a whole
 * number below n for a slot that picks at random; without it, as a preview fills, the first.
 */
export function fillSlots(reader: Reader, quest: QuestRecord, draw?: (n: number) => number): Fill {
  const slots: Record<string, string> = {};
  for (const slot of quest.slots ?? []) {
    const record = pick(reader, slot, slots, matching(reader, slot, slots), draw);
    if (record === undefined) return { unfilled: slot.id };
    slots[slot.id] = record;
  }
  return { slots };
}

/** The first slot of an active quest whose record is gone, and wasn't gone already this run. */
export function goneSlot(reader: Reader, quest: QuestRecord, entry: DeepReadonly<QuestEntry>): Slot | undefined {
  if (entry.slots === undefined) return undefined;
  for (const slot of quest.slots ?? []) {
    const record = own(entry.slots, slot.id);
    if (record === undefined || entry.lost?.includes(slot.id)) continue;
    if (!reader.content.has(slot.type, record)) return slot;
    if (slot.keeps !== undefined && reader.check(bind(slot.keeps, entry.slots)) !== true) return slot;
  }
  return undefined;
}

/** A record's name, as a text shows it: its `name`, or its id. */
export function nameOf(content: RecordStore, type: string, id: string): string {
  const value = content.get<Readonly<Record<string, unknown>>>(type, id);
  return typeof value?.name === 'string' && value.name !== '' ? value.name : id;
}

/** `text` with each `{slot}` its record's name; a `{x}` naming no slot of the quest is left as written (W128). */
export function slotText(content: RecordStore, quest: QuestRecord, slots: Filled | undefined, text: string): string {
  if (slots === undefined || !text.includes('{')) return text;
  return text.replace(/\{([^{}]*)\}/g, (written, name: string) => {
    const slot = quest.slots?.find((each) => each.id === name);
    const record = slot && own(slots, name);
    return slot === undefined || record === undefined ? written : nameOf(content, slot.type, record);
  });
}
