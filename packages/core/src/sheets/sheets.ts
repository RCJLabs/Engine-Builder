/**
 * The sheet module: trigger sheets (M3.1, D36, docs/specs/triggers.md). A sheet is a record,
 * records/sheet/<id>.json, of rows: When an event is raised (with these arguments), If a
 * condition holds, Do these effects. Rows run in the order written, sheets in id order, each as
 * one attempt, so a row that refuses is undone and the action that raised its event stands.
 */
import type { Condition, Domain, Value } from '../logic/types.ts';
import type { RecordStore } from '../records.ts';
import { defineModule, type ModuleContext } from '../sim/module.ts';
import type { Beat, Effect } from '../sim/types.ts';

/** The record type of sheets, and the sheet module's id. */
export const SHEET = 'sheet';

export interface RowWhen {
  /** "module/name", like "flag/changed". */
  readonly event: string;
  /** Values the event's arguments must have for the row to run. One left out matches any. */
  readonly args?: Readonly<Record<string, Value>>;
}

export interface SheetRow {
  /** Unique within its sheet. A once row's id is how a save remembers it fired. */
  readonly id: string;
  readonly note?: string;
  readonly when: RowWhen;
  /** Checked when the event is heard; the row runs only if it is true. */
  readonly if?: Condition;
  readonly do: readonly Effect[];
  /** Runs the first time only. A row that refused hasn't run. */
  readonly once?: boolean;
}

/** A sheet record as the pack holds it, its conditions as trees. */
export interface SheetRecord {
  readonly name?: string;
  readonly description?: string;
  readonly rows: readonly SheetRow[];
}

export interface SheetSlice {
  /** The once rows that have run, as "sheet/row", sorted. */
  readonly fired: readonly string[];
}

interface Placed {
  readonly sheet: string;
  readonly row: SheetRow;
}

// The rows of a content pack by event, made once per pack: content never changes during play.
const byPack = new WeakMap<RecordStore, ReadonlyMap<string, readonly Placed[]>>();

/** Every row that listens for each event, sheets in id order and rows in the order written. */
export function rowsByEvent(content: RecordStore): ReadonlyMap<string, readonly Placed[]> {
  const known = byPack.get(content);
  if (known) return known;
  const rows = new Map<string, Placed[]>();
  for (const sheet of content.ids(SHEET)) {
    for (const row of (content.get(SHEET, sheet) as SheetRecord).rows) {
      const list = rows.get(row.when.event) ?? [];
      list.push({ sheet, row });
      rows.set(row.when.event, list);
    }
  }
  byPack.set(content, rows);
  return rows;
}

/** Whether the event has every argument value the row asks for. */
export const matchesWhen = (when: RowWhen, event: Beat): boolean =>
  Object.entries(when.args ?? {}).every(([name, value]) => event[name] === value);

const firedKey = (sheet: string, row: string) => `${sheet}/${row}`;

function hear(ctx: ModuleContext<SheetSlice>, event: Beat): void {
  for (const { sheet, row } of rowsByEvent(ctx.content).get(event.type) ?? []) {
    if (!matchesWhen(row.when, event)) continue;
    const key = firedKey(sheet, row.id);
    if (row.once && ctx.read().fired.includes(key)) continue;
    if (row.if !== undefined && ctx.check(row.if) !== true) continue;
    const result = ctx.attempt(() => {
      ctx.emit('fired', { sheet, row: row.id });
      for (const effect of row.do) ctx.apply(effect);
      if (row.once) remember(ctx, key);
    });
    if (!result.ok) ctx.emit('refused', { sheet, row: row.id, reason: result.reason });
  }
}

function remember(ctx: ModuleContext<SheetSlice>, key: string): void {
  const fired = ctx.write().fired as string[];
  let i = fired.length;
  while (i > 0 && (fired[i - 1] as string) > key) i--;
  fired.splice(i, 0, key);
}

const SHEET_FIRED: Readonly<Record<string, Domain>> = { sheet: { type: 'ref', to: SHEET }, row: { type: 'text' } };

export const sheetModule = defineModule<SheetSlice>({
  id: SHEET,
  init: () => ({ fired: [] }),
  events: {
    fired: { args: SHEET_FIRED, label: 'A row runs' },
  },
  on: { '*': hear },
});
