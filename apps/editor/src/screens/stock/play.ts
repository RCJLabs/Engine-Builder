/**
 * The stock screens a game is played on and ends on (M4.4, D54): the HUD, its live numbers over
 * the actions on offer; the map (M4.6), the same numbers over the map; and the ending, its numbers
 * and the way back to the shell.
 */
import type { Screen, Widget } from '@eb/ui/format';
import { recordsOf, type StockContext } from './context.ts';
import { bar, button, column, numbers, row, text } from './parts.ts';

/** The stock pages a button opens, where a screen of that id exists: what the HUD and the ending lead to. */
const PAGES = [
  ['inventory', 'Inventory'],
  ['journal', 'Journal'],
  ['codex', 'Codex'],
  ['credits', 'Credits'],
] as const;

const opens = (ctx: StockContext, ids: readonly string[]): Widget[] =>
  PAGES.filter(([id]) => ids.includes(id) && ctx.screens.includes(id)).map(([id, label]) =>
    button(label, { open: id }),
  );

/** Who the HUD follows: the roster's starting members, or each actor without a roster; three at most. */
function followed(ctx: StockContext) {
  if (!ctx.kits.includes('stats')) return [];
  const actors = recordsOf(ctx, 'actor');
  const starting = ctx.kits.includes('roster') ? ctx.starting : [];
  const chosen = starting.length > 0 ? actors.filter(({ id }) => starting.includes(id)) : actors;
  return chosen.slice(0, 3);
}

/** Each followed actor's first three stats, current of most, as bars. */
function pools(ctx: StockContext): Widget[] {
  const stats = recordsOf(ctx, 'stat').slice(0, 3);
  return followed(ctx).flatMap((actor) =>
    stats.map(
      (stat): Widget => ({
        widget: 'progress',
        value: `{stats.current(actor: ${actor.id}, stat: ${stat.id})}`,
        max: `{stats.value(actor: ${actor.id}, stat: ${stat.id})}`,
        label: `${actor.name}: ${stat.name}`,
      }),
    ),
  );
}

export function hudScreen(ctx: StockContext): Screen {
  const start = ctx.modes?.start;
  const shown = numbers(ctx);
  const bars = pools(ctx);
  const ways = opens(ctx, ['inventory', 'journal', 'codex', 'credits']);
  return {
    title: ctx.game,
    shows: start !== undefined && !ctx.shown.has(start) ? [start] : [],
    ...(shown.length > 0 ? { top: row(shown) } : {}),
    main: column(
      [
        ...(bars.length > 0 ? [{ widget: 'panel', children: bars } as const] : []),
        {
          widget: 'list',
          of: 'offered',
          empty: 'Nothing to do now.',
          item: button('{.label}', { take: 'entry' }),
        },
        { widget: 'log', lines: 3, label: 'Lately', empty: 'Nothing has happened yet.' },
      ],
      2,
    ),
    ...(ways.length > 0 ? { bottom: bar(ways) } : {}),
  };
}

/**
 * A space walked (M5.8, D70, docs/specs/movement.md#the-space-widget): the live numbers at the top,
 * the project's first space filling the screen, and the actions on offer under it, for the start
 * mode when no screen shows it yet.
 */
export function spaceScreen(ctx: StockContext): Screen {
  const space = ctx.spaces?.[0];
  const start = ctx.modes?.start;
  const shown = numbers(ctx);
  return {
    title: space?.name ?? 'Space',
    shows: start !== undefined && !ctx.shown.has(start) ? [start] : [],
    ...(shown.length > 0 ? { top: row(shown) } : {}),
    main: { widget: 'space', space: space?.id ?? '' },
    bottom: {
      widget: 'list',
      of: 'offered',
      empty: 'Nothing to do here.',
      item: button('{.label}', { take: 'entry' }),
    },
  };
}

/** Whether the game starts on its map, so the map is its HUD (M4.6). */
export const startsOnMap = (ctx: StockContext): boolean =>
  ctx.kits.includes('maps') && ctx.modes !== undefined && (ctx.modes.travelling ?? []).includes(ctx.modes.start);

/**
 * The map (M4.6, docs/specs/maps.md#the-map-widget): the live numbers over the map's name, the map
 * widget and the log, for each mode that travels no screen shows yet.
 */
export function mapScreen(ctx: StockContext): Screen {
  const shown = numbers(ctx);
  const ways = opens(ctx, ['inventory', 'journal', 'codex', 'credits']);
  return {
    title: 'Map',
    shows: (ctx.modes?.travelling ?? []).filter((mode) => !ctx.shown.has(mode)),
    ...(shown.length > 0 ? { top: row(shown) } : {}),
    main: column(
      [
        text('{map.name}', 'heading'),
        { widget: 'map', empty: 'No map yet.' },
        { widget: 'log', lines: 3, label: 'Lately', empty: 'Nothing has happened yet.' },
      ],
      2,
    ),
    ...(ways.length > 0 ? { bottom: bar(ways) } : {}),
  };
}

export function endingScreen(ctx: StockContext): Screen {
  const endings = (ctx.modes?.endings ?? []).filter((mode) => !ctx.shown.has(mode));
  const quests = ctx.kits.includes('quests') ? [text('Quests done: {quests.tally(state: done)}')] : [];
  return {
    title: 'The end',
    shows: endings,
    main: column(
      [
        text(ctx.game, 'title'),
        text('The game is over.'),
        ...numbers(ctx),
        ...quests,
        ...opens(ctx, ['journal', 'credits']),
      ],
      2,
    ),
    bottom: bar([button('New game', { shell: 'new' }), button('Back to title', { shell: 'title' }, true)]),
  };
}
