/**
 * The kits' checks beyond their type files (M3.3, docs/specs/kits.md): E035 for a record whose
 * numbers or entries don't hold together, E036 for loot tables nested in a loop, and W113 for a
 * shop that stocks again in a game without days, and W156 for a shop whose actor never has anything
 * to sell (M6.8). Each record is checked as it comes; what needs
 * every loot table waits for finish(). The stats, factions, roster, events and dialogue kits' are
 * in their own files, as are the quests', the maps' and the encounters' kits'.
 */

import type { Effect, RecordIndex } from '@eb/core';
import {
  ACTOR,
  AI,
  BEHAVIOUR,
  DIALOGUE,
  ENCOUNTERS,
  EVENTS,
  ITEM,
  kitModules,
  LOOT_TABLE,
  type LootEntry,
  type LootTableRecord,
  MAPS,
  QUEST,
  QUESTS,
  type Range,
  RESOURCE,
  type ResourceRecord,
  ROSTER,
  rangeOf,
  SHOP,
  type ShopRecord,
} from '@eb/kits';
import type { SoundCondition } from './conditions.ts';
import { compareText, type DiagnosticCode } from './diagnostics.ts';
import { DialogueChecks } from './dialogueCheck.ts';
import { EncounterChecks } from './encounterCheck.ts';
import { EventChecks } from './eventCheck.ts';
import { FactionChecks } from './factionCheck.ts';
import { isKitType } from './kitTypes.ts';
import type { Known } from './known.ts';
import { MapChecks } from './mapCheck.ts';
import { QuestChecks } from './questCheck.ts';
import { slotScope } from './questSlots.ts';
import { RosterChecks } from './rosterCheck.ts';
import { StatChecks } from './statCheck.ts';
import type { SpaceTags } from './worldSlots.ts';

/** What a behaviour's fields can name as @slot: @self, the actor running it (M6.3). */
const SELF: Readonly<Record<string, string>> = Object.freeze({ self: ACTOR });

type Report = (code: DiagnosticCode, path: string, message: string) => void;

const KINDS = [ITEM, 'table', RESOURCE] as const;

function checkRange(range: Range | undefined, fallback: number, path: string, what: string, report: Report): void {
  const { min, max } = rangeOf(range, fallback);
  if (max < min) report('E035', `${path}/max`, `${what} runs from ${min} to ${max}: To is below From`);
}

function checkEntry(entry: LootEntry, path: string, report: Report): void {
  const named = KINDS.filter((kind) => entry[kind] !== undefined);
  if (named.length === 0) report('E035', path, 'An entry names an item, a table or a resource');
  if (named.length > 1) report('E035', path, `An entry names one thing, not ${named.join(' and ')}`);
  checkRange(entry.count, 1, `${path}/count`, 'Its count', report);
}

function checkTable(table: LootTableRecord, report: Report): void {
  checkRange(table.picks, 1, '/picks', 'Picks', report);
  table.entries.forEach((entry, i) => {
    checkEntry(entry, `/entries/${i}`, report);
  });
}

function checkResource(resource: ResourceRecord, report: Report): void {
  const lowest = resource.min ?? 0;
  const start = resource.start ?? 0;
  if (resource.max !== undefined && resource.max < lowest) {
    report('E035', '/max', `Highest ${resource.max} is below lowest ${lowest}`);
  } else if (start < lowest) {
    const said = resource.start === undefined ? 'It starts at 0 when Starts at is left out' : `It starts at ${start}`;
    report('E035', resource.start === undefined ? '/min' : '/start', `${said}, below lowest ${lowest}`);
  } else if (resource.max !== undefined && start > resource.max) {
    report('E035', '/start', `It starts at ${start}, above highest ${resource.max}`);
  }
}

function checkShop(shop: ShopRecord, report: Report): void {
  const sellsAt = shop['sells-at'] ?? 100;
  const buysAt = shop['buys-at'] ?? 50;
  if (buysAt > sellsAt) {
    report(
      'E035',
      '/buys-at',
      `It would buy at ${buysAt}% and sell at ${sellsAt}%: selling to it would pay more than buying`,
    );
  }
}

interface Seen<T> {
  readonly value: T;
  readonly report: Report;
}

/** The types records of which the kits on make in play (D44): the roster's actors. */
const madeTypes = (on: readonly string[]): ReadonlySet<string> =>
  new Set(kitModules(on).flatMap((module) => module.made?.types ?? []));

export class KitChecks {
  private readonly on: readonly string[];
  private readonly known: Known;
  private readonly tables = new Map<string, Seen<LootTableRecord>>();
  private readonly shops = new Map<string, Seen<ShopRecord>>();
  /** Each actor by id: whether it carries anything at the start, for a merchant's W156 (M6.8). */
  private readonly carrying = new Map<string, boolean>();
  private readonly stats: StatChecks;
  private readonly factions: FactionChecks;
  /** With the roster kit off, its type names are free for a project's own types (D41). */
  private readonly roster: RosterChecks | undefined;
  private readonly events: EventChecks | undefined;
  private readonly dialogue: DialogueChecks | undefined;
  private readonly quests: QuestChecks | undefined;
  private readonly maps: MapChecks | undefined;
  private readonly encounters: EncounterChecks | undefined;

  constructor(on: readonly string[], known: Known, records: RecordIndex, tags?: SpaceTags) {
    this.on = on;
    this.known = known;
    this.stats = new StatChecks(on, known);
    this.factions = new FactionChecks(known);
    this.roster = on.includes(ROSTER) ? new RosterChecks(on) : undefined;
    this.events = on.includes(EVENTS) ? new EventChecks(on, known) : undefined;
    this.dialogue = on.includes(DIALOGUE) ? new DialogueChecks(on, known.facts) : undefined;
    this.quests = on.includes(QUESTS)
      ? new QuestChecks(known, { records, made: madeTypes(on), ...(tags ? { tags } : {}) })
      : undefined;
    this.maps = on.includes(MAPS) ? new MapChecks(on) : undefined;
    this.encounters = on.includes(ENCOUNTERS) ? new EncounterChecks(on) : undefined;
  }

  /**
   * The slots each field of a record can name (M3.10): a quest's, with the quests kit on; and in a
   * behaviour, with the ai kit on, @self, the actor running it (M6.3).
   */
  slotsOf(type: string, value: unknown): ((path: string) => Readonly<Record<string, string>>) | undefined {
    if (type === BEHAVIOUR && this.on.includes(AI)) return () => SELF;
    return this.quests && type === QUEST ? slotScope(value) : undefined;
  }

  /** One record that passed its type's schema. */
  record(type: string, id: string, value: unknown, report: Report): void {
    // The roster's cap and a consequence can read a flag, which is the engine's type, not a kit's.
    this.roster?.record(type, id, value, report);
    this.events?.record(type, id, value, report);
    if (!isKitType(type, this.on)) return;
    this.stats.record(type, id, value, report);
    this.factions.record(type, id, value, report);
    this.dialogue?.record(type, id, value, report);
    this.quests?.record(type, id, value, report);
    this.maps?.record(type, id, value, report);
    this.encounters?.record(type, id, value, report);
    if (type === LOOT_TABLE) {
      checkTable(value as LootTableRecord, report);
      this.tables.set(id, { value: value as LootTableRecord, report });
    } else if (type === RESOURCE) checkResource(value as ResourceRecord, report);
    else if (type === ACTOR) {
      const carries = (value as { readonly carries?: Readonly<Record<string, number>> }).carries;
      this.carrying.set(id, Object.keys(carries ?? {}).length > 0);
    } else if (type === SHOP) {
      const shop = value as ShopRecord;
      checkShop(shop, report);
      this.shops.set(id, { value: shop, report });
      const days = shop.stock?.every?.days;
      if (days !== undefined && !this.known.openFacts && this.known.facts['time.day'] === undefined) {
        report(
          'W113',
          '/stock/every',
          `It stocks again every ${days} days, which reads time.day: this game has no time module`,
        );
      }
    }
  }

  /** A record's sound condition, for the bands, ranks, choices, lines, options, stages and objectives it names (E039 to E043). */
  condition(report: Report, sound: SoundCondition): void {
    this.factions.condition(report, sound);
    this.roster?.condition(report, sound);
    this.events?.condition(report, sound);
    this.dialogue?.condition(report, sound);
    this.quests?.condition(report, sound);
  }

  /** The flags a kit's record reads as the game runs (W108, W109): the roster's cap-flag. */
  flagsRead(type: string, value: unknown): readonly string[] {
    return this.roster?.reads(type, value) ?? [];
  }

  /** The flags an effect reads as the game runs (W108, W109): the one a consequence waits on. */
  flagsReadBy(effect: Effect): readonly string[] {
    return this.events?.reads(effect) ?? [];
  }

  /** An effect whose schema passed, at path. */
  effect(report: Report, path: string, effect: Effect): void {
    this.roster?.effect(report, path, effect);
    this.events?.effect(report, path, effect);
    this.dialogue?.effect(effect);
    this.quests?.effect(report, path, effect);
    this.maps?.effect(report, path, effect);
    this.encounters?.effect(report, path, effect);
  }

  /** What needs every loot table: loops (E036), and stock tables that give a resource (E035). */
  finish(): void {
    this.loops();
    this.stats.finish();
    this.factions.finish();
    this.roster?.finish();
    this.events?.finish();
    this.dialogue?.finish();
    this.quests?.finish();
    this.maps?.finish();
    this.encounters?.finish();
    for (const [, shop] of [...this.shops].sort(([a], [b]) => compareText(a, b))) {
      const table = shop.value.stock?.table;
      const resource = table === undefined ? undefined : this.resourceIn(table, new Set());
      if (resource) {
        shop.report(
          'E035',
          '/stock/table',
          `Its stock table gives ${resource.resource} (in ${resource.table}): a shelf holds items only`,
        );
      }
      const { actor, stock } = shop.value;
      const stocked = (stock?.items ?? []).length > 0 || stock?.table !== undefined;
      if (actor !== undefined && !stocked && this.carrying.get(actor) === false) {
        shop.report('W156', '/actor', `${actor} carries nothing and its stock is empty: it never has anything to sell`);
      }
    }
  }

  private nested(id: string): { index: number; table: string }[] {
    const table = this.tables.get(id)?.value;
    if (!table) return [];
    return table.entries.flatMap((entry, index) =>
      entry.table !== undefined && this.tables.has(entry.table) ? [{ index, table: entry.table }] : [],
    );
  }

  /** Each loop reported once, at its first table by id, as the path round it. */
  private loops(): void {
    const reported = new Set<string>();
    for (const start of [...this.tables.keys()].sort(compareText)) {
      if (reported.has(start)) continue;
      const loop = this.loopFrom(start);
      if (!loop) continue;
      for (const id of loop.path) reported.add(id);
      const said = [...loop.path, start].join(' → ');
      this.tables.get(start)?.report('E036', `/entries/${loop.index}/table`, `Loot tables nest in a loop: ${said}`);
    }
  }

  /** A path from `start` back to it, breadth first so the shortest, with the entry it leaves `start` by. */
  private loopFrom(start: string): { path: string[]; index: number } | undefined {
    const queue: { at: string; path: string[]; index: number }[] = this.nested(start).map((n) => ({
      at: n.table,
      path: [start],
      index: n.index,
    }));
    const seen = new Set<string>();
    while (queue.length > 0) {
      const { at, path, index } = queue.shift() as { at: string; path: string[]; index: number };
      if (at === start) return { path, index };
      if (seen.has(at)) continue;
      seen.add(at);
      for (const next of this.nested(at)) queue.push({ at: next.table, path: [...path, at], index });
    }
    return undefined;
  }

  /** The first resource a table gives, walking the tables in it, or undefined. */
  private resourceIn(id: string, seen: Set<string>): { resource: string; table: string } | undefined {
    if (seen.has(id)) return undefined;
    seen.add(id);
    const table = this.tables.get(id)?.value;
    for (const entry of table?.entries ?? []) {
      if (entry.resource !== undefined) return { resource: entry.resource, table: id };
      if (entry.table !== undefined) {
        const found = this.resourceIn(entry.table, seen);
        if (found) return found;
      }
    }
    return undefined;
  }
}
