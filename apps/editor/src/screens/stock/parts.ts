/** The widgets the stock screens are made of: the shapes the hut's own screens use, as functions. */
import type { Action, Widget } from '@eb/ui/format';
import { recordsOf, type StockContext } from './context.ts';

type TextStyle = 'title' | 'heading' | 'body' | 'caption';

export const text = (words: string, style?: TextStyle): Widget => ({
  widget: 'text',
  text: words,
  ...(style ? { style } : {}),
});

export const button = (label: string, action: Action, primary = false, detail?: string): Widget => ({
  widget: 'button',
  label,
  ...(detail === undefined ? {} : { detail }),
  ...(primary ? { style: 'primary' as const } : {}),
  action,
});

export const column = (children: readonly Widget[], gap?: number): Widget => ({
  widget: 'stack',
  ...(gap !== undefined ? { gap } : {}),
  children,
});

/** A row that wraps, as the hut's top bar. */
export const row = (children: readonly Widget[], justify: 'between' | 'end' = 'between'): Widget => ({
  widget: 'stack',
  direction: 'row',
  justify,
  wrap: true,
  children,
});

/** A bar of buttons at the end, as the hut's bottom bars are. */
export const bar = (buttons: readonly Widget[]): Widget => row(buttons, 'end');

export const close = (label = 'Close'): Widget => button(label, { close: true });

/** Each resource the economy kit keeps, as a live number. */
export const resources = (ctx: StockContext): Widget[] =>
  ctx.kits.includes('economy')
    ? recordsOf(ctx, 'resource').map(({ id, name }) => text(`{economy.amount(resource: ${id})} ${name}`))
    : [];

/** The day, with the time kit on, and each resource, as live numbers. */
export const numbers = (ctx: StockContext): Widget[] => [
  ...(ctx.kits.includes('time') ? [text('Day {time.day}', 'heading')] : []),
  ...resources(ctx),
];
