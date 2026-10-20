/**
 * The stock screens a button opens (M4.4, D54): the inventory, the journal, the codex and the
 * credits. Each is modal and has a Close, so nothing is left open with no way back (W134).
 */
import type { Screen, Widget } from '@eb/ui/format';
import { recordsOf, type StockContext } from './context.ts';
import { bar, close, column, text } from './parts.ts';

const page = (title: string, main: Widget): Screen => ({ title, modal: true, main, bottom: bar([close()]) });

const panel = (children: readonly Widget[]): Widget => ({ widget: 'panel', children });

export const inventoryScreen = (): Screen =>
  page('Inventory', {
    widget: 'list',
    of: 'bag',
    empty: 'The bag is empty.',
    item: text('{.name} ×{.count}'),
  });

export const journalScreen = (): Screen =>
  page('Journal', {
    widget: 'tabs',
    tabs: [
      {
        label: 'Quests',
        children: [
          {
            widget: 'list',
            of: 'journal',
            empty: 'Nothing in the journal yet.',
            item: panel([text('{.name}', 'heading'), text('{.log}'), text('{.objectives}', 'caption')]),
          },
        ],
      },
      { label: 'Log', children: [{ widget: 'log', lines: 20, label: 'So far', empty: 'Nothing yet.' }] },
    ],
  });

export const creditsScreen = (ctx: StockContext): Screen =>
  page(
    'Credits',
    column(
      [
        text(ctx.game, 'title'),
        text('Made with Engine-Builder', 'caption'),
        {
          widget: 'list',
          of: 'credits',
          empty: 'No assets to credit.',
          item: panel([text('{.asset}', 'heading'), text('{.author} · {.licence}'), text('{.source}', 'caption')]),
        },
      ],
      2,
    ),
  );

/** A codex tab: every record of a type, held back until known when `known` is given. */
function tab(label: string, type: string, item: readonly Widget[], known?: string) {
  return {
    label,
    children: [
      {
        widget: 'list' as const,
        of: 'records' as const,
        type,
        ...(known !== undefined ? { known, unknown: text('Not yet found', 'caption') } : {}),
        empty: `No ${label.toLowerCase()} yet.`,
        item: panel([text('{.name}', 'heading'), ...item]),
      },
    ],
  };
}

/** The codex's tabs, one for each kit on that keeps records worth knowing (docs/specs/stock-screens.md). */
export function codexTabs(ctx: StockContext) {
  const on = (kit: string) => ctx.kits.includes(kit);
  const stats = recordsOf(ctx, 'stat').slice(0, 3);
  return [
    ...(on('inventory')
      ? [
          tab(
            'Items',
            'item',
            [text('Carried: {inventory.count(item: @entry)}', 'caption')],
            'inventory.count(item: @entry) > 0',
          ),
        ]
      : []),
    ...(on('factions')
      ? [
          tab('Factions', 'faction', [
            text('Standing {factions.standing(faction: @entry)} · {factions.band(faction: @entry)}', 'caption'),
          ]),
        ]
      : []),
    ...(on('events')
      ? [
          tab(
            'Events',
            'event',
            [text('Seen {events.seen(event: @entry)} times', 'caption')],
            'events.seen(event: @entry) > 0',
          ),
        ]
      : []),
    ...(on('stats')
      ? [
          tab(
            'People',
            'actor',
            stats.map(({ id, name }) =>
              text(
                `${name} {stats.current(actor: @entry, stat: ${id})} of {stats.value(actor: @entry, stat: ${id})}`,
                'caption',
              ),
            ),
            on('roster') ? 'roster.member(actor: @entry)' : undefined,
          ),
        ]
      : []),
  ];
}

export const codexScreen = (ctx: StockContext): Screen => page('Codex', { widget: 'tabs', tabs: codexTabs(ctx) });
