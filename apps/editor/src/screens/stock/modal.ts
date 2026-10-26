/**
 * The stock screens a kit's mode opens over the game (M4.4, D54): a talk, an event, a shop and a
 * hall, and since M6.8 a container or a body. Each is modal, so the game shows behind it, and leaves
 * by the kit's own action.
 */
import type { Screen } from '@eb/ui/format';
import type { StockContext } from './context.ts';
import { bar, button, column, resources, row, text } from './parts.ts';

/** The kit's mode, which the game has while the kit is on, unless a screen shows it already. */
export const showing = (ctx: StockContext, mode: string): readonly string[] => (ctx.shown.has(mode) ? [] : [mode]);

// A talk's options and an event's choices show their odds, a fight's among them, under the label
// whenever the sim shows them (M4.7); a hall's offers have none.
const choices = (of: 'talk' | 'event' | 'offered') =>
  ({
    widget: 'list',
    of,
    item: button('{.label}', { take: 'entry' }, false, of === 'offered' ? undefined : '{.odds}'),
  }) as const;

export const dialogueScreen = (ctx: StockContext): Screen => ({
  title: 'A talk',
  shows: showing(ctx, 'talking'),
  modal: true,
  main: column([text('{talk.speaker}', 'heading'), text('{talk.text}'), choices('talk')]),
  bottom: bar([button('Go on', { take: 'dialogue/go-on' }, true)]),
});

export const eventScreen = (ctx: StockContext): Screen => ({
  title: 'An event',
  shows: showing(ctx, 'choosing'),
  modal: true,
  main: column([text('{event.name}', 'heading'), text('{event.text}'), choices('event')]),
});

// A shop an actor keeps says what they have left to pay with (M6.8).
const keeper = (ctx: StockContext) => (ctx.merchants ? [text('{shop.keeper} has {shop.purse}')] : []);

export const shopScreen = (ctx: StockContext): Screen => ({
  title: 'The shop',
  shows: showing(ctx, 'shopping'),
  modal: true,
  top: row([text('{shop.name}', 'heading'), ...keeper(ctx), ...resources(ctx)]),
  main: {
    widget: 'tabs',
    tabs: [
      {
        label: 'Buy',
        children: [
          {
            widget: 'list',
            of: 'shelf',
            empty: 'The shelves are bare.',
            item: button('{.name}: {.price}, {.count} left', { take: 'entry' }),
          },
        ],
      },
      {
        label: 'Sell',
        children: [
          {
            widget: 'list',
            of: 'bag',
            empty: 'Nothing to sell.',
            item: button('Sell {.name} for {.price}', { take: 'entry' }),
          },
        ],
      },
    ],
  },
  bottom: bar([button('Leave', { take: 'economy/leave' })]),
});

/** A container's or a body's lines to take, the bag's to put in, Take all and Close (M6.8, D80). */
export const containerScreen = (ctx: StockContext): Screen => ({
  title: 'A container',
  shows: showing(ctx, 'container'),
  modal: true,
  top: row([text('{container.name}', 'heading')]),
  main: {
    widget: 'tabs',
    tabs: [
      {
        label: 'Take',
        children: [
          {
            widget: 'list',
            of: 'held',
            empty: 'It is empty.',
            item: button('Take {.name} ({.count})', { take: 'entry' }),
          },
        ],
      },
      {
        label: 'Put',
        children: [
          {
            widget: 'list',
            of: 'bag',
            empty: 'You carry nothing.',
            item: button('Put {.name} ({.count})', { take: 'entry' }),
          },
        ],
      },
    ],
  },
  bottom: bar([button('Take all', { take: 'inventory/take-all' }), button('Close', { take: 'inventory/close' }, true)]),
});

/** A hall's hires and its way out are the only actions its mode allows, so the actions on offer are the hall. */
export const hallScreen = (ctx: StockContext): Screen => ({
  title: 'Hiring',
  shows: showing(ctx, 'hiring'),
  modal: true,
  main: column([text('Who will you hire?', 'heading'), choices('offered')]),
});
