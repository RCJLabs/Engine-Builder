/**
 * The events kit's checks beyond its type files (M3.7, docs/specs/events.md#checks): E035 for an
 * event, a deck or a `later` that doesn't hold together, E041 for a condition naming a choice its
 * event doesn't have, W118 for an event no choice of which is always open, W119 for a cost in a
 * game without the economy kit, and W120 for a consequence counting days in a game without a
 * time module. A condition or a `later` can name an event or a flag before its record is read, so
 * E041 and the flag's kind wait for finish().
 */
import { type Effect, FLAG, type FlagRecord, NAME_PATTERN } from '@eb/core';
import { DECK, type DeckRecord, ECONOMY, EVENT, type EventRecord } from '@eb/kits';
import type { SoundCondition } from './conditions.ts';
import type { DiagnosticCode } from './diagnostics.ts';
import { factTests } from './flagCheck.ts';
import type { Known } from './known.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;

const UNWRITABLE = "can't be written in a condition: use lowercase words joined by hyphens";
const KINDS = ['days', 'choices', 'flag'] as const;

function checkEvent(event: EventRecord, economy: boolean, report: Report): void {
  const seen = new Set<string>();
  event.choices.forEach((choice, i) => {
    const at = `/choices/${i}`;
    if (!NAME_PATTERN.test(choice.id)) report('E035', `${at}/id`, `"${choice.id}" ${UNWRITABLE}`);
    else if (seen.has(choice.id)) report('E035', `${at}/id`, `${choice.id} is a choice twice`);
    seen.add(choice.id);
    if (choice.outcomes) {
      const total = choice.outcomes.reduce((sum, outcome) => sum + outcome.chance, 0);
      if (total !== 100) report('E035', `${at}/outcomes`, `Its chances add up to ${total}: they add up to 100`);
    }
    if (!economy && choice.cost !== undefined) {
      report('W119', `${at}/cost`, 'Nothing charges a cost in a game without the economy kit');
    }
  });
  const free = event.choices.some((c) => c.if === undefined && c.needs === undefined && c.cost === undefined);
  if (!free) {
    report(
      'W118',
      '/choices',
      'Every choice has a Shown if, a Needs or a Cost: a party that meets none of them is stuck here',
    );
  }
}

function checkDeck(deck: DeckRecord, report: Report): void {
  const seen = new Set<string>();
  deck.events.forEach((entry, i) => {
    if (seen.has(entry.event)) {
      report('E035', `/events/${i}/event`, `${entry.event} is in the deck twice: give it one entry and a weight`);
    }
    seen.add(entry.event);
  });
  const recent = deck.recent ?? 0;
  if (recent > 0 && recent >= seen.size) {
    report(
      'E035',
      '/recent',
      `It passes over its last ${recent} draws and has ${seen.size} events: once each has come, none could`,
    );
  }
}

interface Waiting {
  readonly report: Report;
  readonly path: string;
  readonly name: string;
}

interface Named extends Waiting {
  readonly event: string;
}

export class EventChecks {
  private readonly economy: boolean;
  private readonly days: boolean;
  private readonly events = new Map<string, EventRecord>();
  private readonly flags = new Map<string, FlagRecord>();
  private readonly named: Named[] = [];
  private readonly waiting: Waiting[] = [];

  constructor(on: readonly string[], known: Known) {
    this.economy = on.includes(ECONOMY);
    // Unknown until a game's scripts have run: its own time module may say days start.
    this.days = known.openEvents || known.events['time/day-started'] !== undefined;
  }

  /** One record that passed its schema: the kit's own, and the flags a consequence may wait on. */
  record(type: string, id: string, value: unknown, report: Report): void {
    if (type === EVENT) {
      checkEvent(value as EventRecord, this.economy, report);
      this.events.set(id, value as EventRecord);
    } else if (type === DECK) checkDeck(value as DeckRecord, report);
    else if (type === FLAG) this.flags.set(id, value as FlagRecord);
  }

  /** An effect whose schema passed: a consequence's After and id, and a cancel's id. */
  effect(report: Report, path: string, effect: Effect): void {
    if (effect.effect === 'cancel-later') this.id(report, path, effect.id);
    if (effect.effect !== 'later') return;
    this.id(report, path, effect.id);
    const after = (effect.after ?? {}) as Readonly<Record<string, unknown>>;
    const given = KINDS.filter((kind) => after[kind] !== undefined);
    if (given.length === 0) report('E035', `${path}/after`, 'Give one of Days, Choices and Flag');
    else if (given.length > 1) report('E035', `${path}/after`, `It counts ${given.join(' and ')}: give one`);
    if (after.by !== undefined && after.flag === undefined) {
      report('E035', `${path}/after/by`, 'Risen by counts a flag’s rise: give Flag too');
    }
    if (after.days !== undefined && !this.days) {
      report('W120', `${path}/after/days`, 'It counts days, which time/day-started says: this game has no time module');
    }
    if (typeof after.flag === 'string') this.waiting.push({ report, path: `${path}/after/flag`, name: after.flag });
  }

  /** The flags an effect reads as the game runs (W108, W109): the one a consequence waits on. */
  reads(effect: Effect): readonly string[] {
    const flag = effect.effect === 'later' ? (effect.after as { flag?: unknown } | undefined)?.flag : undefined;
    return typeof flag === 'string' ? [flag] : [];
  }

  /** A condition's tests that name a choice. */
  condition(report: Report, sound: SoundCondition): void {
    for (const [inner, test] of factTests(sound.tree, '')) {
      const { event, choice } = test.args ?? {};
      if (test.fact === 'events.chose' && typeof event === 'string' && typeof choice === 'string') {
        this.named.push({ report, path: sound.at(inner), event, name: choice });
      }
    }
  }

  finish(): void {
    for (const { report, path, event, name } of this.named) {
      const ids = this.events.get(event)?.choices.map((c) => c.id);
      if (ids !== undefined && !ids.includes(name)) {
        report('E041', path, `The event ${event} has no choice ${name}: its choices are ${ids.join(', ')}`);
      }
    }
    for (const { report, path, name } of this.waiting) {
      const flag = this.flags.get(name);
      if (flag !== undefined && flag.number === undefined) {
        report('E035', path, `${name} is on or off: a consequence waits on a number flag’s rise`);
      }
    }
  }

  private id(report: Report, path: string, id: unknown): void {
    if (typeof id === 'string' && !NAME_PATTERN.test(id)) report('E035', `${path}/id`, `"${id}" ${UNWRITABLE}`);
  }
}
