/**
 * The stock screens New screen offers (M4.4, D54, docs/specs/stock-screens.md): each a template
 * written into ui/ from the project as it stands, offered while the kits it reads are on.
 */
import type { Screen } from '@eb/ui/format';
import { hasKits, type StockContext } from './context.ts';
import { containerScreen, dialogueScreen, eventScreen, hallScreen, shopScreen } from './modal.ts';
import { codexScreen, codexTabs, creditsScreen, inventoryScreen, journalScreen, spaceMapScreen } from './pages.ts';
import { endingScreen, hudScreen, mapScreen, spaceScreen, startsOnMap } from './play.ts';

export interface Stock {
  /** The id New screen starts its name from, and the screen's file. */
  readonly id: string;
  /** What the form calls it, and the name it starts with. */
  readonly name: string;
  readonly about: string;
  /** Whether the project can have it: the kits it reads are on. */
  readonly offered: (ctx: StockContext) => boolean;
  readonly build: (ctx: StockContext) => Screen;
}

const needs =
  (...kits: string[]) =>
  (ctx: StockContext) =>
    hasKits(ctx, kits);

export const STOCK: readonly Stock[] = [
  {
    id: 'hud',
    name: 'HUD',
    about: 'The live numbers over the actions on offer',
    // A game that starts on its map has the map for its HUD.
    offered: (ctx) => !startsOnMap(ctx),
    build: hudScreen,
  },
  {
    id: 'map',
    name: 'Map',
    about: 'The map the party is on, to travel by',
    offered: needs('maps'),
    build: mapScreen,
  },
  {
    id: 'space',
    name: 'Space',
    about: 'A space walked, the numbers over it and the actions under it',
    offered: (ctx) => (ctx.spaces ?? []).length > 0,
    build: spaceScreen,
  },
  {
    id: 'space-map',
    name: 'Space map',
    about: 'The space walked from above, with the player and the tracked quest’s markers',
    offered: (ctx) => (ctx.spaces ?? []).length > 0,
    build: spaceMapScreen,
  },
  {
    id: 'dialogue',
    name: 'Dialogue',
    about: 'A talk: its line and its options',
    offered: needs('dialogue'),
    build: dialogueScreen,
  },
  {
    id: 'event',
    name: 'Event',
    about: 'An event: its text and its choices',
    offered: needs('events'),
    build: eventScreen,
  },
  {
    id: 'shop',
    name: 'Shop',
    about: 'Buy from the shelf and sell from the bag',
    offered: needs('economy', 'inventory'),
    build: shopScreen,
  },
  {
    id: 'container',
    name: 'Container',
    about: 'A chest’s or a body’s lines to take, and the bag’s to put in',
    // Only a game that can open one has the mode (M6.8): a use that holds, or the fighting kit's bodies.
    // So it is offered once the game's modes are known, its scripts run.
    offered: (ctx) => ctx.modes?.all.includes('container') === true,
    build: containerScreen,
  },
  { id: 'hall', name: 'Hall', about: 'Hire from a hall’s offers', offered: needs('roster'), build: hallScreen },
  {
    id: 'inventory',
    name: 'Inventory',
    about: 'What the bag holds',
    offered: needs('inventory'),
    build: inventoryScreen,
  },
  { id: 'journal', name: 'Journal', about: 'The quests and the log', offered: needs('quests'), build: journalScreen },
  {
    id: 'codex',
    name: 'Codex',
    about: 'Records, each shown once found',
    offered: (ctx) => codexTabs(ctx).length > 0,
    build: codexScreen,
  },
  {
    id: 'credits',
    name: 'Credits',
    about: 'Each asset’s credit, from the provenance log',
    offered: () => true,
    build: creditsScreen,
  },
  {
    id: 'ending',
    name: 'Ending',
    about: 'The numbers at the end, and the way back to the title',
    offered: () => true,
    build: endingScreen,
  },
];

/** A template's text as the file holds it: two-space JSON, as the other templates are written. */
export const stockText = (stock: Stock, ctx: StockContext): string => `${JSON.stringify(stock.build(ctx), null, 2)}\n`;

/**
 * The order to make them all in: the pages first, so the HUD, the map and the ending find the ones
 * there are; a space before the HUD, so a game walked starts on its space (M5.8).
 */
const LAST = ['space', 'hud', 'map', 'ending'];
export const STOCK_ORDER: readonly Stock[] = [
  ...STOCK.filter((stock) => !LAST.includes(stock.id)),
  ...LAST.flatMap((id) => STOCK.filter((stock) => stock.id === id)),
];

/**
 * Every stock screen the project's kits allow, each written as New screen would write it after the
 * ones before: what the gate makes in the editor, and what the tests make without it.
 */
export function allStock(ctx: StockContext): { readonly id: string; readonly text: string }[] {
  const written: { id: string; text: string }[] = [];
  let now = ctx;
  for (const stock of STOCK_ORDER) {
    if (!stock.offered(now)) continue;
    const text = stockText(stock, now);
    written.push({ id: stock.id, text });
    const shows = (JSON.parse(text) as { shows?: readonly string[] }).shows ?? [];
    now = { ...now, screens: [...now.screens, stock.id], shown: new Set([...now.shown, ...shows]) };
  }
  return written;
}
