/**
 * The kits' views as a screen reads them (docs/specs/screens.md#lists): the open talk and event as
 * their `open-talk` and `open-event` previews give them, the open shop's shelf, the bag, and the
 * journal as `start-quest` previews each quest. Through the sim's own previews and facts, so a
 * choice's lock, cost and odds on screen are the ones the sim rolls.
 */
import {
  type Action,
  type Condition,
  canonicalJson,
  type FactCatalog,
  type GameState,
  type ModeFrame,
  type RecordStore,
} from '@eb/core';
import type { Entry, Shown } from './types.ts';
import { costText, fightText, nameOf, oddsText, whyText } from './words.ts';

/** What a view reads the game through, in the current state. */
export interface Reading {
  readonly state: GameState;
  readonly content: RecordStore;
  readonly catalog: FactCatalog;
  /** The keys of the actions on offer, as canonicalJson writes them. */
  readonly offered: ReadonlySet<string>;
  fact(id: string, args?: Readonly<Record<string, unknown>>): unknown;
  preview(effect: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
  /** Whether a condition holds now, as the sim checks it, null when unknown: a codex's `known` (M4.4). */
  check(condition: Condition): boolean | null;
}

const shown = (value: unknown): Shown =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;

function entry(reading: Reading, key: string, fields: Record<string, Shown>, action?: Action): Entry {
  const enabled = action !== undefined && reading.offered.has(canonicalJson(action));
  return { key, fields, ...(action ? { action } : {}), enabled };
}

/** The top frame of a mode, with its data, if it is on the stack. */
export function frameOf(state: GameState, mode: string): ModeFrame | undefined {
  return [...state.kernel.modes].reverse().find((frame) => frame.id === mode);
}

interface ChoiceShown {
  readonly id: string;
  readonly label: string;
  readonly cost?: unknown;
  readonly open: boolean;
  readonly outcomes?: unknown;
  /** What it does for sure, as each effect's preview gives it: a fight's table among them (M4.7). */
  readonly effects?: unknown;
}

/** A talk's options or an event's choices, each with the action that takes it. */
function choiceEntries(reading: Reading, choices: unknown, take: (id: string) => Action): Entry[] {
  if (!Array.isArray(choices)) return [];
  return (choices as ChoiceShown[]).map((choice) =>
    entry(
      reading,
      choice.id,
      {
        label: choice.label,
        locked: !choice.open,
        why: choice.open ? null : whyText(choice as never, reading.catalog, reading.content),
        cost: costText(choice.cost, reading.content),
        odds: oddsText(choice.outcomes) ?? fightText(choice.effects, reading.content),
      },
      take(choice.id),
    ),
  );
}

export interface Shows {
  readonly fields: Record<string, Shown>;
  readonly entries: readonly Entry[];
}

export function talkShows(reading: Reading, talk: string): Shows {
  const view = reading.preview({ effect: 'open-talk', talk });
  const speaker = typeof view.speaker === 'string' ? view.speaker : undefined;
  return {
    fields: {
      'talk.name': nameOf(reading.content, 'talk', talk) ?? null,
      'talk.speaker': speaker === undefined ? null : (nameOf(reading.content, 'speaker', speaker) ?? speaker),
      'talk.text': shown(view.text),
    },
    entries: choiceEntries(reading, view.options, (option) => ({ type: 'dialogue/say', option })),
  };
}

export function eventShows(reading: Reading, event: string): Shows {
  const view = reading.preview({ effect: 'open-event', event });
  const record = reading.content.has('event', event) ? (reading.content.get('event', event) as { text?: unknown }) : {};
  return {
    fields: { 'event.name': nameOf(reading.content, 'event', event) ?? null, 'event.text': shown(record.text) },
    entries: choiceEntries(reading, view.choices, (choice) => ({ type: 'events/choose', choice })),
  };
}

interface ShelfItem {
  readonly item: string;
  readonly left: number;
}

interface ShopKept {
  readonly actor?: string;
  readonly currency?: string;
}

/**
 * The open shop's shelf, in its order, each item at the price the economy kit quotes; for a shop an
 * actor keeps (M6.8), their bag in item id order, and who they are and what their purse holds.
 */
export function shelfShows(reading: Reading, shop: string): Shows {
  const slice = reading.state.economy as { shops?: Record<string, { shelf?: readonly ShelfItem[] }> } | undefined;
  const record = (reading.content.has('shop', shop) ? reading.content.get('shop', shop) : {}) as ShopKept;
  const { actor, currency } = record;
  const shelf =
    actor === undefined
      ? (slice?.shops?.[shop]?.shelf ?? [])
      : reading.content
          .ids('item')
          .map((item) => ({ item, left: reading.fact('economy.stock', { shop, item }) as number }))
          .filter((s) => s.left > 0);
  const kept: Record<string, Shown> =
    actor === undefined
      ? {}
      : {
          'shop.keeper': nameOf(reading.content, 'actor', actor) ?? actor,
          'shop.purse': shown(reading.fact('economy.purse', { actor, resource: currency })),
        };
  return {
    fields: { 'shop.name': nameOf(reading.content, 'shop', shop) ?? shop, ...kept },
    entries: shelf.map(({ item, left }) =>
      entry(
        reading,
        item,
        {
          item,
          name: nameOf(reading.content, 'item', item) ?? item,
          price: shown(reading.fact('economy.price', { shop, item })),
          count: left,
        },
        { type: 'economy/buy', item },
      ),
    ),
  };
}

/**
 * What is carried, in id order; with a shop open, each at its offer and with the action that sells
 * it; with a container open instead (M6.8), with the action that puts it in.
 */
export function bagEntries(reading: Reading, shop: string | undefined, container = false): Entry[] {
  const slice = reading.state.inventory as { bag?: Record<string, number> } | undefined;
  const bag = slice?.bag ?? {};
  return Object.keys(bag)
    .filter((item) => (bag[item] ?? 0) > 0)
    .sort()
    .map((item) =>
      entry(
        reading,
        item,
        {
          item,
          name: nameOf(reading.content, 'item', item) ?? item,
          count: bag[item] ?? 0,
          price: shop === undefined || container ? null : shown(reading.fact('economy.offer', { shop, item })),
        },
        container ? { type: 'inventory/put', item } : shop === undefined ? undefined : { type: 'economy/sell', item },
      ),
    );
}

interface QuestShown {
  readonly name: string;
  readonly state: string;
  readonly log?: readonly string[];
  readonly objectives?: readonly { readonly text: string; readonly done: boolean; count?: number; to?: number }[];
}

/**
 * Every quest started, in id order, as the quests kit's journal shows it. Each takes quests/track
 * (M6.6): only an active quest not tracked already can, and no mode offers it, so it is enabled here.
 */
export function journalEntries(reading: Reading): Entry[] {
  const tracked = reading.fact('quests.tracked');
  return reading.content.ids('quest').flatMap((quest) => {
    const view = reading.preview({ effect: 'start-quest', quest }) as unknown as QuestShown;
    if (view.state === 'waiting') return [];
    const open = (view.objectives ?? []).filter((o) => !o.done);
    const objectives = open.map((o) => (o.to === undefined ? o.text : `${o.text} (${o.count ?? 0}/${o.to})`));
    const fields = {
      quest,
      name: view.name,
      state: view.state,
      log: view.log?.at(-1) ?? null,
      objectives: objectives.length === 0 ? null : objectives.join('; '),
      tracked: quest === tracked ? 'Tracked' : null,
    };
    const action = { type: 'quests/track', quest };
    return [{ key: quest, fields, action, enabled: view.state === 'active' && quest !== tracked }];
  });
}
