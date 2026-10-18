/**
 * The stats and gear kits' checks beyond their type files (M3.4, docs/specs/stats.md): E035 for
 * numbers and entries that don't hold together, and W114 for a timed status in a game without
 * days or ticks. What needs other records (an actor's base against its stat's bounds, what it
 * wears against its slots and the items' own) waits for finish().
 */
import { pointerSegment } from '@eb/core';
import {
  ACTOR,
  GEAR,
  ITEM,
  STAT,
  STATUS,
  type StatRecord,
  type StatusRecord,
  type WearableItem,
  type WearingActor,
} from '@eb/kits';
import { compareText, type DiagnosticCode } from './diagnostics.ts';
import type { Known } from './known.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;

function checkStat(stat: StatRecord, report: Report): void {
  const lowest = stat.min ?? 0;
  if (stat.max !== undefined && stat.max < lowest) {
    report('E035', '/max', `Highest ${stat.max} is below lowest ${lowest}`);
  } else if (stat.start !== undefined && (stat.start < lowest || (stat.max !== undefined && stat.start > stat.max))) {
    report('E035', '/start', `It starts at ${stat.start}, outside ${lowest} to ${stat.max ?? 'no limit'}`);
  }
}

function checkStatus(status: StatusRecord, known: Known, report: Report): void {
  (status.modifiers ?? []).forEach((m, i) => {
    if (m.add === undefined && m.percent === undefined) {
      report('E035', `/modifiers/${i}`, 'A modifier adds to its stat, takes a percent of it, or both');
    }
  });
  const { lasts } = status;
  if (lasts === undefined) return;
  if ((lasts.days === undefined) === (lasts.ticks === undefined)) {
    report('E035', '/lasts', 'It lasts days or ticks: one of the two');
    return;
  }
  const fact = lasts.days !== undefined ? 'time.day' : 'time.tick';
  if (!known.openFacts && known.facts[fact] === undefined) {
    report(
      'W114',
      '/lasts',
      `It lasts ${lasts.days !== undefined ? 'days' : 'ticks'}, which reads ${fact}: this game has no time module`,
    );
  }
}

interface SeenActor {
  readonly value: WearingActor;
  readonly report: Report;
}

export class StatChecks {
  private readonly gear: boolean;
  private readonly known: Known;
  private readonly stats = new Map<string, StatRecord>();
  private readonly items = new Map<string, WearableItem>();
  private readonly actors = new Map<string, SeenActor>();

  constructor(on: readonly string[], known: Known) {
    this.gear = on.includes(GEAR);
    this.known = known;
  }

  /** One record of a kit's type that passed its schema; false for a type these checks don't read. */
  record(type: string, id: string, value: unknown, report: Report): boolean {
    if (type === STAT) {
      checkStat(value as StatRecord, report);
      this.stats.set(id, value as StatRecord);
    } else if (type === STATUS) checkStatus(value as StatusRecord, this.known, report);
    else if (type === ACTOR) this.actors.set(id, { value: value as WearingActor, report });
    else if (type === ITEM) this.items.set(id, value as WearableItem);
    else return false;
    return true;
  }

  /** What reads other records: each actor's bases, and what it wears. */
  finish(): void {
    for (const [, actor] of [...this.actors].sort(([a], [b]) => compareText(a, b))) {
      this.bases(actor);
      if (this.gear) this.wears(actor);
    }
  }

  private bases({ value, report }: SeenActor): void {
    for (const [id, base] of Object.entries(value.stats ?? {})) {
      const stat = this.stats.get(id);
      if (!stat) continue;
      const lowest = stat.min ?? 0;
      if (base < lowest || (stat.max !== undefined && base > stat.max)) {
        report(
          'E035',
          `/stats/${pointerSegment(id)}`,
          `${base} is outside ${id}'s ${lowest} to ${stat.max ?? 'no limit'}`,
        );
      }
    }
  }

  private wears({ value, report }: SeenActor): void {
    for (const [slot, id] of Object.entries(value.wears ?? {})) {
      const path = `/wears/${pointerSegment(slot)}`;
      const item = this.items.get(id);
      if (value.slots !== undefined && !value.slots.includes(slot)) {
        report('E035', path, `It has no slot ${slot}: its slots are ${value.slots.join(', ')}`);
      } else if (item && item.slot === undefined) {
        report('E035', path, `${id} can't be worn: it names no slot`);
      } else if (item && item.slot !== slot) {
        report('E035', path, `${id} is worn in ${item.slot}, not ${slot}`);
      }
    }
  }
}
