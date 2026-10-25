/**
 * The gear kit's module (M3.4, D42, docs/specs/stats.md): items worn in slots, taken out of the
 * party's bag when worn and put back when taken off, as Wasteland Protocol's stash has it. The
 * stats kit's values read what worn items do through gear.add and gear.percent.
 */
import { type DeepReadonly, defineModule, type FactArgs, type RecordStore } from '@eb/core';
import { room } from '../inventory/items.ts';
import { ITEM } from '../inventory/types.ts';
import { ACTOR, STAT } from '../stats/types.ts';
import { GEAR, type GearSlice, SLOT, type SlotRecord } from './types.ts';
import { gearParts, wearable, wearer, wornBy } from './worn.ts';

type Fact = (id: string, args?: FactArgs) => unknown;

/** What equipping or taking off would do, or why it is refused: the effect and its preview share it. */
type Verdict =
  | { readonly ok: true; readonly slot: string; readonly item: string; readonly old?: string }
  | { readonly ok: false; readonly reason: string; readonly data: Readonly<Record<string, unknown>> };

const no = (reason: string, data: Readonly<Record<string, unknown>>): Verdict => ({ ok: false, reason, data });

const wornIn = (content: RecordStore, slice: DeepReadonly<GearSlice>, actor: string, slot: string) =>
  wornBy(content, slice, actor).find(([s]) => s === slot)?.[1];

/** Whether the party's bag can take one more of the item. */
const fits = (content: RecordStore, fact: Fact, item: string) =>
  room(wearable(content, item), fact('inventory.count', { item }) as number, 1) >= 1;

/**
 * The slots the item can be worn in, in slot order: the one its record names, or else every slot
 * that takes one of its tags (M4.12), so a ship's engine fits any of its engine bays.
 */
function slotsFor(content: RecordStore, item: string): string[] {
  const { slot, tags = [] } = wearable(content, item);
  if (slot !== undefined) return [slot];
  if (tags.length === 0) return [];
  return content
    .ids(SLOT)
    .filter((id) => ((content.get(SLOT, id) as SlotRecord).takes ?? []).some((tag) => tags.includes(tag)));
}

function equipVerdict(
  content: RecordStore,
  slice: DeepReadonly<GearSlice>,
  fact: Fact,
  actor: string,
  item: string,
  chosen?: string,
): Verdict {
  const fitting = slotsFor(content, item);
  if (fitting.length === 0) return no('not-wearable', { actor, item });
  const slots = wearer(content, actor).slots;
  const has = (slot: string) => slots === undefined || slots.includes(slot);
  if (chosen !== undefined && !fitting.includes(chosen)) return no('wrong-slot', { actor, item, slot: chosen });
  const usable = (chosen === undefined ? fitting : [chosen]).filter(has);
  if (usable.length === 0) return no('no-such-slot', { actor, slot: chosen ?? (fitting[0] as string) });
  // A free one first: a second engine goes in the next bay rather than over the first.
  const slot = usable.find((each) => wornIn(content, slice, actor, each) === undefined) ?? (usable[0] as string);
  const old = wornIn(content, slice, actor, slot);
  if (old === item) return { ok: true, slot, item, old };
  if ((fact('inventory.count', { item }) as number) < 1) return no('not-carried', { actor, item });
  if (old !== undefined && !fits(content, fact, old)) return no('no-room', { actor, item: old });
  return old === undefined ? { ok: true, slot, item } : { ok: true, slot, item, old };
}

function unequipVerdict(
  content: RecordStore,
  slice: DeepReadonly<GearSlice>,
  fact: Fact,
  actor: string,
  slot: string,
): Verdict {
  wearer(content, actor);
  const item = wornIn(content, slice, actor, slot);
  if (item === undefined) return no('empty', { actor, slot });
  if (!fits(content, fact, item)) return no('no-room', { actor, item });
  return { ok: true, slot, item };
}

/** Sets what a slot wears in the state: dropped where it is what the actor's record has. */
function setWorn(
  worn: Record<string, Record<string, string | null>>,
  recorded: string | null,
  actor: string,
  slot: string,
  item: string | null,
): void {
  const mine = { ...(worn[actor] ?? {}) };
  if (item === recorded) delete mine[slot];
  else mine[slot] = item;
  if (Object.keys(mine).length === 0) delete worn[actor];
  else worn[actor] = mine;
}

const sum = (parts: readonly { add: number; percent: number }[], key: 'add' | 'percent') =>
  parts.reduce((total, p) => total + p[key], 0);

const ACTOR_ARG = { actor: { type: 'ref', to: ACTOR } } as const;
const PLACE = { ...ACTOR_ARG, slot: { type: 'ref', to: SLOT }, item: { type: 'ref', to: ITEM } } as const;

export const gearKit = defineModule<GearSlice>({
  id: GEAR,
  init: () => ({ worn: {} }),
  facts: {
    wearing: {
      args: { ...ACTOR_ARG, item: { type: 'ref', to: ITEM } },
      domain: { type: 'int', min: 0 },
      label: 'slots wearing it',
      read: ({ content, state }, { actor, item }) =>
        wornBy(content, state, actor as string).filter(([, worn]) => worn === item).length,
    },
    // What the slot wears now (M6.4): the fighting kit finds an actor's weapon by its slots.
    'in-slot': {
      args: { ...ACTOR_ARG, slot: { type: 'ref', to: SLOT } },
      domain: { type: 'ref', to: ITEM },
      label: 'what the slot wears',
      read: ({ content, state }, { actor, slot }) =>
        wornBy(content, state, actor as string).find(([s]) => s === slot)?.[1],
    },
    add: {
      args: { ...ACTOR_ARG, stat: { type: 'ref', to: STAT } },
      domain: { type: 'int' },
      label: 'points from gear',
      read: ({ content, state }, { actor, stat }) =>
        sum(gearParts(content, state, actor as string, stat as string), 'add'),
    },
    percent: {
      args: { ...ACTOR_ARG, stat: { type: 'ref', to: STAT } },
      domain: { type: 'int' },
      label: 'percent from gear',
      read: ({ content, state }, { actor, stat }) =>
        sum(gearParts(content, state, actor as string, stat as string), 'percent'),
    },
  },
  effects: {
    equip: {
      run: (ctx, effect) => {
        const actor = effect.actor as string;
        const item = effect.item as string;
        const chosen = effect.slot as string | undefined;
        const verdict = equipVerdict(ctx.content, ctx.read(), ctx.fact, actor, item, chosen);
        if (!verdict.ok) return ctx.refuse(verdict.reason, verdict.data);
        if (verdict.old === item) return;
        ctx.apply({ effect: 'take-item', item, count: 1 });
        if (verdict.old !== undefined) {
          ctx.apply({ effect: 'give-item', item: verdict.old, count: 1 });
          ctx.emit('unequipped', { actor, slot: verdict.slot, item: verdict.old });
        }
        const recorded = wearer(ctx.content, actor).wears?.[verdict.slot] ?? null;
        setWorn(ctx.write().worn as Record<string, Record<string, string | null>>, recorded, actor, verdict.slot, item);
        ctx.emit('equipped', { actor, slot: verdict.slot, item });
      },
      preview: (ctx, effect) => {
        const actor = effect.actor as string;
        const item = effect.item as string;
        const verdict = equipVerdict(ctx.content, ctx.read(), ctx.fact, actor, item, effect.slot as string | undefined);
        return verdict.ok
          ? { actor, item, slot: verdict.slot, replaces: verdict.old ?? null }
          : { actor, item, refused: verdict.reason };
      },
    },
    unequip: {
      run: (ctx, effect) => {
        const actor = effect.actor as string;
        const slot = effect.slot as string;
        const verdict = unequipVerdict(ctx.content, ctx.read(), ctx.fact, actor, slot);
        if (!verdict.ok) return ctx.refuse(verdict.reason, verdict.data);
        ctx.apply({ effect: 'give-item', item: verdict.item, count: 1 });
        const recorded = wearer(ctx.content, actor).wears?.[slot] ?? null;
        setWorn(ctx.write().worn as Record<string, Record<string, string | null>>, recorded, actor, slot, null);
        ctx.emit('unequipped', { actor, slot, item: verdict.item });
      },
      preview: (ctx, effect) => {
        const actor = effect.actor as string;
        const slot = effect.slot as string;
        const verdict = unequipVerdict(ctx.content, ctx.read(), ctx.fact, actor, slot);
        return verdict.ok ? { actor, slot, item: verdict.item } : { actor, slot, refused: verdict.reason };
      },
    },
  },
  events: {
    equipped: { args: PLACE, label: 'An item is worn' },
    unequipped: { args: PLACE, label: 'An item is taken off' },
  },
});
