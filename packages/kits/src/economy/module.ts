/**
 * The economy kit's module (M3.3, D41, docs/specs/kits.md): the party's resources, costs paid
 * all or none, and shops. Buying and selling are actions in the mode a shop opens, so bots and
 * menus offer exactly what the shop accepts, at the price the quote gives. A shop an actor keeps
 * (M6.8, D80) sells from their bag and pays into and out of their purse.
 */
import { defineModule, evaluate, type FactView, type ModuleContext, type OptionsView } from '@eb/core';
import { itemRecord } from '../inventory/items.ts';
import { ITEM } from '../inventory/types.ts';
import { ACTOR } from '../stats/types.ts';
import { addAmount, amountOf, costEntries, payCost, resourceRecord, shortOf } from './amounts.ts';
import { addToPurse, purseOf } from './purses.ts';
import { buysItem, quoteBuy, quoteSell } from './quote.ts';
import { buyVerdict, inStock, sellVerdict, shopIn, shopRecord, stockIfDue, type Trade, takeFromShelf } from './shop.ts';
import { ECONOMY, type EconomySlice, RESOURCE, SHOP, SHOPPING } from './types.ts';

const tradeIn = (ctx: ModuleContext<EconomySlice>): Trade => ({
  content: ctx.content,
  slice: ctx.read(),
  holds: (condition) => ctx.check(condition) === true,
  fact: (id, args) => ctx.fact(id, args),
});

const tradeOf = (view: OptionsView<EconomySlice>): Trade => ({
  content: view.content,
  slice: view.state,
  holds: (condition) => view.check(condition) === true,
  fact: view.fact,
});

// A fact reads conditions through the facts it can see, as ctx.check does.
const tradeFor = (view: FactView<EconomySlice>): Trade => ({
  content: view.content,
  slice: view.state,
  holds: (condition) => evaluate(condition, (test) => view.fact(test.fact, test.args)) === true,
  fact: view.fact,
});

function buy(ctx: ModuleContext<EconomySlice>, item: unknown) {
  const shop = shopIn(ctx.modes.current);
  if (shop === undefined) return ctx.refuse('not-shopping');
  const verdict = buyVerdict(tradeIn(ctx), shop, item);
  if (!verdict.ok) return ctx.refuse(verdict.reason, verdict.data);
  const { currency, actor } = shopRecord(ctx.content, shop);
  if (verdict.price > 0) addAmount(ctx, currency, -verdict.price);
  if (actor === undefined) takeFromShelf(ctx, shop, item as string);
  else {
    if (verdict.price > 0) addToPurse(ctx, actor, currency, verdict.price);
    ctx.apply({ effect: 'take-item', actor, item, count: 1 });
  }
  ctx.apply({ effect: 'give-item', item, count: 1 });
  ctx.emit('bought', { shop, item, price: verdict.price });
}

function sell(ctx: ModuleContext<EconomySlice>, item: unknown) {
  const shop = shopIn(ctx.modes.current);
  if (shop === undefined) return ctx.refuse('not-shopping');
  const verdict = sellVerdict(tradeIn(ctx), shop, item);
  if (!verdict.ok) return ctx.refuse(verdict.reason, verdict.data);
  const { currency, actor } = shopRecord(ctx.content, shop);
  ctx.apply({ effect: 'take-item', item, count: 1 });
  if (actor !== undefined) {
    ctx.apply({ effect: 'give-item', actor, item, count: 1 });
    if (verdict.price > 0) addToPurse(ctx, actor, currency, -verdict.price);
  }
  if (verdict.price > 0) addAmount(ctx, currency, verdict.price);
  ctx.emit('sold', { shop, item, price: verdict.price });
}

const SHOP_ARG = { shop: { type: 'ref', to: SHOP } } as const;
const ITEM_ARG = { item: { type: 'ref', to: ITEM } } as const;
const PRICE = { type: 'int', min: 0 } as const;

export const economyKit = defineModule<EconomySlice>({
  id: ECONOMY,
  init: () => ({ amounts: {}, shops: {}, purses: {} }),
  // Version 2 (M6.8) adds `purses`: a version 1 save changed none, so every purse is its record's.
  version: 2,
  migrate: { 2: (slice) => ({ ...(slice as object), purses: {} }) },
  facts: {
    amount: {
      args: { resource: { type: 'ref', to: RESOURCE } },
      domain: { type: 'int' },
      read: ({ state, content }, { resource }) => amountOf(state, content, resource as string),
    },
    price: {
      args: { ...SHOP_ARG, ...ITEM_ARG },
      domain: PRICE,
      label: 'the price',
      read: (view, { shop, item }) => {
        const record = shopRecord(view.content, shop);
        const trade = tradeFor(view);
        if (!view.content.has(ITEM, item as string) || inStock(trade, shop as string, record, item as string) < 1) {
          return undefined;
        }
        return quoteBuy(trade, record, item as string);
      },
    },
    offer: {
      args: { ...SHOP_ARG, ...ITEM_ARG },
      domain: PRICE,
      label: 'the offer',
      read: (view, { shop, item }) => {
        const record = shopRecord(view.content, shop);
        if (!view.content.has(ITEM, item as string)) return undefined;
        return buysItem(record, itemRecord(view.content, item))
          ? quoteSell(tradeFor(view), record, item as string)
          : undefined;
      },
    },
    stock: {
      args: { ...SHOP_ARG, ...ITEM_ARG },
      domain: { type: 'int', min: 0 },
      label: 'on the shelf',
      read: (view, { shop, item }) =>
        view.content.has(ITEM, item as string)
          ? inStock(tradeFor(view), shop as string, shopRecord(view.content, shop), item as string)
          : 0,
    },
    purse: {
      args: { actor: { type: 'ref', to: ACTOR }, resource: { type: 'ref', to: RESOURCE } },
      domain: { type: 'int' },
      label: 'in the purse of',
      read: ({ state, content }, { actor, resource }) => purseOf(state, content, actor as string, resource as string),
    },
  },
  effects: {
    'add-resource': {
      run: (ctx, effect) => addAmount(ctx, effect.resource as string, effect.by as number),
      preview: (ctx, effect) => {
        const resource = effect.resource as string;
        const record = resourceRecord(ctx.content, resource);
        const from = amountOf(ctx.read(), ctx.content, resource);
        const to = from + (effect.by as number);
        if (to < (record.min ?? 0)) return { resource, from, to: from, refused: 'not-enough' };
        return { resource, from, to: Math.min(to, record.max ?? Number.POSITIVE_INFINITY) };
      },
    },
    'pay-cost': {
      run: (ctx, effect) => payCost(ctx, effect.cost),
      preview: (ctx, effect) => ({
        cost: effect.cost,
        afford: shortOf(ctx.read(), ctx.content, costEntries(effect.cost)) === undefined,
      }),
    },
    'open-shop': (ctx, effect) => {
      const id = effect.shop as string;
      const shop = shopRecord(ctx.content, id);
      const open = shopIn(ctx.modes.current);
      if (open !== undefined) return ctx.refuse('already-shopping', { shop: open });
      stockIfDue(ctx, id, shop);
      ctx.modes.push(SHOPPING, { shop: id });
      ctx.emit('opened', { shop: id });
    },
  },
  actions: {
    buy: {
      run: (ctx, action) => buy(ctx, action.item),
      options: (view) => {
        const shop = shopIn(view.mode);
        if (shop === undefined) return [];
        const trade = tradeOf(view);
        // A merchant's goods are their bag, read item by item in id order, as selling reads the party's.
        const goods =
          shopRecord(view.content, shop).actor === undefined
            ? (view.state.shops[shop]?.shelf ?? []).map((s) => s.item)
            : view.content.ids(ITEM);
        return goods.filter((item) => buyVerdict(trade, shop, item).ok).map((item) => ({ item }));
      },
    },
    sell: {
      run: (ctx, action) => sell(ctx, action.item),
      // The bag is the inventory kit's, so what is carried is read item by item, in id order.
      options: (view) => {
        const shop = shopIn(view.mode);
        if (shop === undefined) return [];
        const trade = tradeOf(view);
        return view.content
          .ids(ITEM)
          .filter((item) => sellVerdict(trade, shop, item).ok)
          .map((item) => ({ item }));
      },
    },
    leave: {
      run: (ctx) => {
        const shop = shopIn(ctx.modes.current);
        if (shop === undefined) return ctx.refuse('not-shopping');
        ctx.modes.pop();
        ctx.emit('left', { shop });
      },
      options: (view) => (shopIn(view.mode) === undefined ? [] : [{}]),
    },
  },
  modes: {
    [SHOPPING]: { actions: ['economy/buy', 'economy/sell', 'economy/leave'] },
  },
  events: {
    changed: { args: { resource: { type: 'ref', to: RESOURCE }, by: { type: 'int' } }, label: 'An amount changes' },
    opened: { args: SHOP_ARG, label: 'A shop opens' },
    bought: { args: { ...SHOP_ARG, ...ITEM_ARG, price: PRICE }, label: 'Something is bought' },
    sold: { args: { ...SHOP_ARG, ...ITEM_ARG, price: PRICE }, label: 'Something is sold' },
    left: { args: SHOP_ARG, label: 'The shop is left' },
  },
});
