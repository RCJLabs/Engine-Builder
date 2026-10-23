import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';
import { shipStat } from './shared';

interface Refit {
  /** What each hull slot wears: the gear kit's equip, kept here so a part can be taken off by name. */
  worn: Record<string, string>;
}

type Ctx = ModuleContext<Refit>;

const SHIP = 'ship';
const slotsOf = (ctx: { content: { ids(type: string): readonly string[] } }) => [...ctx.content.ids('slot')].sort();

/** The room aboard (the roster's cap): the lesser of the berths and the life support. */
function refreshRoom(ctx: Ctx) {
  const read = (id: string, args?: Record<string, unknown>) => ctx.fact(id, args);
  const room = Math.min(shipStat(read, 'berths'), shipStat(read, 'life-support'));
  ctx.apply({ effect: 'set-flag', flag: 'room', to: Math.max(0, room) });
}

function fitPart(ctx: Ctx, item: string, give: boolean) {
  const slot = slotsOf(ctx).find((id) => ctx.read().worn[id] === undefined);
  if (slot === undefined) return ctx.refuse('hull-full', { item });
  if (give) ctx.apply({ effect: 'give-item', item });
  ctx.apply({ effect: 'equip', actor: SHIP, item, slot });
  ctx.write().worn[slot] = item;
  refreshRoom(ctx);
}

function stripSlot(ctx: Ctx, slot: string) {
  if (ctx.read().worn[slot] === undefined) return ctx.refuse('empty-slot', { slot });
  ctx.apply({ effect: 'unequip', actor: SHIP, slot });
  delete ctx.write().worn[slot];
  refreshRoom(ctx);
}

/**
 * Refitting: parts on hand fitted to the ship's hull, and fitted ones taken off back into the
 * hold. A part fits any free hull space: its place on the hull, which the original's builder
 * decides, doesn't matter here (D62). Offered at the hangar and docked at a station.
 */
export const refit: Module = defineModule<Refit>({
  id: 'refit',
  init: () => ({ worn: {} }),
  actions: {
    fit: {
      run: (ctx, action) => fitPart(ctx, action.item as string, false),
      options: ({ content, fact, state }) => {
        if (slotsOf({ content }).every((slot) => state.worn[slot] !== undefined)) return [];
        return content
          .ids('item')
          .filter((item) => (fact('inventory.count', { item }) as number) > 0)
          .map((item) => ({ item }));
      },
    },
    strip: {
      run: (ctx, action) => stripSlot(ctx, action.slot as string),
      options: ({ state }) => Object.keys(state.worn).map((slot) => ({ slot, item: state.worn[slot] })),
    },
  },
  effects: {
    'fit-part': (ctx, effect) => fitPart(ctx, effect.item as string, effect.give === true),
    'refresh-room': (ctx) => refreshRoom(ctx),
  },
  facts: {
    fitted: {
      args: { item: { type: 'ref', to: 'item' } },
      domain: { type: 'int', min: 0 },
      label: 'parts of this kind fitted',
      read: ({ state }, { item }) => Object.values(state.worn).filter((worn) => worn === item).length,
    },
    free: {
      domain: { type: 'int', min: 0 },
      label: 'free hull space',
      read: ({ state, content }) => slotsOf({ content }).filter((slot) => state.worn[slot] === undefined).length,
    },
  },
});
