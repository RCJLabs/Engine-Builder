/**
 * The stock screens a kit's mode opens over the game (M4.4, D54): a talk, an event, a shop and a
 * hall. Each is modal, so the game shows behind it, and leaves by the kit's own action.
 */
import type { Screen } from '@eb/ui/format';
import type { StockContext } from './context.ts';
import { bar, button, column, resources, row, text } from './parts.ts';

/** The kit's mode, unless a screen shows it already or the game, once run, has no such mode. */
export function showing(ctx: StockContext, mode: string): readonly string[] {
  if (ctx.shown.has(mode) || (ctx.modes !== undefined && !ctx.modes.all.includes(mode))) return [];
  return [mode];
}

const choices = (of: 'talk' | 'event' | 'offered') =>
  ({ widget: 'list', of, item: button('{.label}', { take: 'entry' }) }) as const;

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

export const shopScreen = (ctx: StockContext): Screen => ({
  title: 'The shop',
  shows: showing(ctx, 'shopping'),
  modal: true,
  top: row([text('{shop.name}', 'heading'), ...resources(ctx)]),
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

/** A hall's hires and its way out are the only actions its mode allows, so the actions on offer are the hall. */
export const hallScreen = (ctx: StockContext): Screen => ({
  title: 'Hiring',
  shows: showing(ctx, 'hiring'),
  modal: true,
  main: column([text('Who will you hire?', 'heading'), choices('offered')]),
});
