/**
 * A sheet's own checks, beyond its schema (M3.1, D36): each row's event against the event catalogue
 * (E022) and its argument values against the event's (E023), and each row id once (E024).
 */
import {
  domainProblem,
  EVENT_PATTERN,
  formatRef,
  isRecordId,
  isSlotName,
  pointerSegment,
  type RecordIndex,
  slotProblem,
} from '@eb/core';
import type { Report } from './checkValue.ts';
import type { Known } from './known.ts';

export interface SheetContext {
  readonly known: Known;
  readonly records: RecordIndex;
  readonly report: Report;
  use(key: string, path: string): void;
  /** A row's When names this record as an argument's value: for a flag, the row hears it change. */
  heard(type: string, id: string): void;
  /** The slots a quest's count can name (M3.10). */
  readonly slots?: Readonly<Record<string, string>>;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks a sheet record's value. What zod refused, it leaves alone: zod has reported it (E001). */
export function checkSheet(value: unknown, ctx: SheetContext): void {
  if (!isObject(value) || !Array.isArray(value.rows)) return;
  const byId = new Map<string, number[]>();
  for (const [i, row] of value.rows.entries()) {
    if (!isObject(row)) continue;
    if (isRecordId(row.id)) byId.set(row.id, [...(byId.get(row.id) ?? []), i]);
    checkWhen(row.when, `/rows/${i}/when`, ctx);
  }
  for (const [id, rows] of byId) {
    if (rows.length < 2) continue;
    for (const i of rows) ctx.report('E024', `/rows/${i}/id`, `${rows.length} rows of this sheet have the id "${id}"`);
  }
}

/** A When's event (E022) and its argument values (E023): a sheet row's, or a quest count's (M3.9). */
export function checkWhen(when: unknown, path: string, ctx: SheetContext): void {
  if (!isObject(when) || typeof when.event !== 'string' || !EVENT_PATTERN.test(when.event)) return;
  const info = ctx.known.events[when.event];
  if (!info) {
    // A game's own event, which only `--types` can tell exists.
    if (!ctx.known.openEvents) ctx.report('E022', `${path}/event`, `No event "${when.event}" in this game`);
    return;
  }
  if (!isObject(when.args)) return;
  const declared = info.args ?? {};
  for (const [name, arg] of Object.entries(when.args)) {
    const at = `${path}/args/${pointerSegment(name)}`;
    const domain = declared[name];
    if (!domain) {
      ctx.report('E023', at, `"${when.event}" has no argument "${name}"`);
      continue;
    }
    if (isSlotName(arg)) {
      const problem = slotProblem(arg, domain, ctx.slots);
      if (problem) ctx.report('E044', at, problem);
      continue;
    }
    if (domain.type === 'ref' && isRecordId(arg)) {
      ctx.use(formatRef(domain.to, arg), at);
      ctx.heard(domain.to, arg);
    }
    const problem = domainProblem(arg, domain, ctx.records);
    if (problem) ctx.report('E023', at, problem);
  }
}
