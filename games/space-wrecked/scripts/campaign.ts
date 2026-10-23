import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';
import {
  type Background,
  backgroundOf,
  checklist,
  credits,
  flies,
  heatOf,
  pursuerOf,
  type Read,
  rulesOf,
  stepped,
} from './shared';

const ENDINGS = ['none', 'settled'] as const;
const LINES = ['power', 'thrust', 'berths', 'air', 'parts'] as const;

interface Campaign {
  background?: string;
  act: number;
  ending: (typeof ENDINGS)[number];
  world?: string;
}

type Ctx = ModuleContext<Campaign>;
const reader =
  (ctx: Ctx): Read =>
  (id, args) =>
    ctx.fact(id, args);

/**
 * A new campaign from a background (data/backgrounds.json): its credits and parts on hand, its
 * half-built ship fitted, its captain and start crew rolled, and its pursuer's side hostile. The
 * original lets the player name the captain and pick two traits; here the captain is named from
 * the background's list and the traits are shuffled from them all.
 */
function begin(ctx: Ctx, background: string) {
  const start = ctx.content.getOrThrow<Background>('background', background);
  Object.assign(ctx.write(), { background, act: 1 });
  if (start.credits > 0) ctx.apply({ effect: 'add-resource', resource: 'credits', by: start.credits });
  for (const [item, count] of Object.entries(start.parts)) ctx.apply({ effect: 'give-item', item, count });
  for (const item of start.ship) ctx.apply({ effect: 'fit-part', item, give: true });
  // The start crew comes aboard whatever the berths: the checklist is what asks for room.
  ctx.apply({ effect: 'set-flag', flag: 'room', to: start.crew.length });
  ctx.apply({ effect: 'recruit', recruit: start.captain });
  for (const job of start.crew.slice(1)) ctx.apply({ effect: 'recruit', recruit: `crew-${job}` });
  ctx.apply({ effect: 'refresh-room' });
  const pursuer = pursuerOf(ctx.content, reader(ctx));
  if (pursuer)
    ctx.apply({ effect: 'change-standing', faction: pursuer.side, by: rulesOf(ctx.content)['pursuer-standing'] });
  ctx.emit('began', { background });
  ctx.modes.replace('hangar');
}

/** What a lost raid costs (the original's raidLoss): the dearest part on hand, or half the credits. */
function raidLoss(ctx: Ctx) {
  const value = (item: string) => ctx.content.getOrThrow<{ value?: number }>('item', item).value ?? 0;
  const held = ctx.content
    .ids('item')
    .filter((item) => (ctx.fact('inventory.count', { item }) as number) > 0)
    .sort((a, b) => value(b) - value(a) || (a < b ? -1 : 1));
  const [dearest] = held;
  if (dearest !== undefined) return ctx.apply({ effect: 'take-item', item: dearest });
  const half = stepped(credits(reader(ctx)) / 2);
  if (half > 0) ctx.apply({ effect: 'add-resource', resource: 'credits', by: -half });
}

const raidDue = (content: Parameters<typeof rulesOf>[0], fact: Read) => heatOf(fact) >= rulesOf(content)['raid-heat'];

/**
 * The campaign: who the captain was, the act, the hangar's actions in act 1, and how it ends.
 * Act 1 ends at Launch, once the flight checklist passes; act 2, the run (run.ts), at Settle.
 */
export const campaign: Module = defineModule<Campaign>({
  id: 'campaign',
  init: () => ({ act: 1, ending: 'none' }),
  actions: {
    begin: {
      run: (ctx, action) => begin(ctx, action.background as string),
      options: ({ content }) => content.ids('background').map((background) => ({ background })),
    },
    jobs: {
      run: (ctx) => ctx.apply({ effect: 'open-board' }),
      // A raid that is due blocks the board until it is faced.
      options: ({ content, fact }) => (raidDue(content, fact) ? [] : [{}]),
    },
    shop: {
      run: (ctx) => {
        const background = backgroundOf(ctx.content, reader(ctx));
        if (!background) return ctx.refuse('no-background');
        const district = ctx.content.getOrThrow<{ shop: string }>('district', background.district);
        ctx.apply({ effect: 'open-shop', shop: district.shop });
      },
    },
    pay: {
      run: (ctx) => {
        const payment = pursuerOf(ctx.content, reader(ctx))?.payment;
        if (!payment) return ctx.refuse('no-payment');
        ctx.apply({ effect: 'pay-cost', cost: { credits: payment.credits } });
        ctx.apply({ effect: 'add-to-flag', flag: 'heat', by: -payment.heat });
      },
      options: ({ content, fact }) => {
        const payment = pursuerOf(content, fact)?.payment;
        return payment && credits(fact) >= payment.credits && heatOf(fact) > 0 ? [{}] : [];
      },
    },
    raid: {
      run: (ctx) => {
        const pursuer = pursuerOf(ctx.content, reader(ctx));
        if (!pursuer) return ctx.refuse('no-pursuer');
        ctx.apply({ effect: 'open-event', event: pursuer.raid });
      },
      options: ({ content, fact }) => (raidDue(content, fact) ? [{}] : []),
    },
    launch: {
      run: (ctx) => {
        if (!flies(ctx.content, reader(ctx))) return ctx.refuse('not-flightworthy');
        ctx.write().act = 2;
        ctx.emit('launched', {});
      },
      options: ({ content, fact }) => (flies(content, fact) ? [{}] : []),
    },
  },
  effects: {
    'raid-loss': (ctx) => raidLoss(ctx),
    settle: (ctx, effect) => {
      if (ctx.read().ending !== 'none') return;
      Object.assign(ctx.write(), { ending: 'settled', world: effect.world as string });
      ctx.modes.replace('settled');
      ctx.emit('settled', { world: effect.world as string });
    },
  },
  facts: {
    background: {
      domain: { type: 'ref', to: 'background' },
      label: 'the captain’s background',
      read: ({ state }) => state.background,
    },
    act: { domain: { type: 'int', min: 1, max: 3 }, label: 'the act', read: ({ state }) => state.act },
    ending: { domain: { type: 'enum', values: ENDINGS }, label: 'how it ended', read: ({ state }) => state.ending },
    world: { domain: { type: 'text' }, label: 'the world settled', read: ({ state }) => state.world },
    ready: {
      domain: { type: 'bool' },
      label: 'the ship can fly',
      read: ({ content, fact }) => flies(content, fact),
    },
    check: {
      args: { line: { type: 'enum', values: LINES } },
      domain: { type: 'bool' },
      label: 'a line of the flight checklist passes',
      read: ({ content, fact }, { line }) => checklist(content, fact)[line as string] === true,
    },
  },
  events: {
    began: { args: { background: { type: 'ref', to: 'background' } }, label: 'The campaign begins' },
    launched: { args: {}, label: 'The ship launches' },
    settled: { args: { world: { type: 'text' } }, label: 'The crew settles a world' },
  },
  modes: {
    choose: { actions: ['campaign/begin'] },
    hangar: {
      actions: ['campaign/jobs', 'campaign/shop', 'campaign/pay', 'campaign/raid', 'campaign/launch', 'refit/*'],
    },
    settled: { actions: [] },
  },
});
