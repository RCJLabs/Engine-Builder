/**
 * The outline of a screen (M4.5, D55, docs/specs/designer.md#the-outline): a row for the screen,
 * one for each of its slots (Top, Main and Bottom; a list's Item and Unknown), filled or empty,
 * one for each widget and each tab, in the file's order. Plain functions of the screen's JSON, so
 * a file half made, or with a widget of a kind the format lacks, still has an outline.
 */
import { pointer } from './paths.ts';
import { CONTAINERS, KIND_NAMES, WIDGETS, type WidgetKind } from './widgets.ts';

export interface Row {
  /** What the row selects, a JSON Pointer: '' for the screen. */
  readonly at: string;
  readonly depth: number;
  readonly role: 'screen' | 'widget' | 'empty' | 'tab';
  /** The slot the row fills, or would: "Top", "Main", "Bottom", "Item" or "Unknown". */
  readonly slot?: string;
  /** A widget's kind as the file says it. */
  readonly kind?: string;
  readonly summary: string;
  /** Where the row sits in a list of widgets or tabs, for Up, Down and the drag. */
  readonly among?: { readonly list: string; readonly index: number; readonly count: number };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const words = (value: unknown, most = 40): string => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > most ? `${text.slice(0, most - 1)}…` : text;
};
const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

export const isKind = (kind: unknown): kind is WidgetKind => WIDGETS.includes(kind as WidgetKind);
export const isContainer = (kind: unknown): boolean => CONTAINERS.includes(kind as WidgetKind);

/** A widget in a few words: what it says, or what it lists or holds. */
export function summaryOf(widget: Record<string, unknown>): string {
  switch (widget.widget) {
    case 'text':
      return words(widget.text);
    case 'button':
    case 'progress':
      return words(widget.label);
    case 'image':
      return words(widget.alt) || words(widget.asset);
    case 'list':
      return widget.of === 'records' && typeof widget.type === 'string'
        ? `records of ${widget.type}`
        : words(widget.of);
    case 'stack':
    case 'panel':
      return `${widget.direction === 'row' ? 'row' : 'column'}, ${count(list(widget.children).length, 'widget')}`;
    case 'grid':
      return `${typeof widget.columns === 'number' ? count(widget.columns, 'column') : 'columns'}, ${count(list(widget.children).length, 'widget')}`;
    case 'tabs':
      return count(list(widget.tabs).length, 'tab');
    case 'log':
      return words(widget.label);
    default:
      return 'not a widget the format has';
  }
}

/** The rows of a screen's JSON, top to bottom. */
export function rowsOf(screen: unknown): Row[] {
  const rows: Row[] = [{ at: '', depth: 0, role: 'screen', summary: words(isObject(screen) ? screen.title : '') }];
  const root = isObject(screen) ? screen : {};
  for (const [key, slot] of [
    ['top', 'Top'],
    ['main', 'Main'],
    ['bottom', 'Bottom'],
  ] as const) {
    slotRows(rows, root[key], pointer([key]), slot, 1);
  }
  return rows;
}

function slotRows(rows: Row[], value: unknown, at: string, slot: string, depth: number): void {
  if (value === undefined) rows.push({ at, depth, role: 'empty', slot, summary: 'Empty' });
  else widgetRows(rows, value, at, depth, slot);
}

function widgetRows(rows: Row[], value: unknown, at: string, depth: number, slot?: string, among?: Row['among']) {
  const widget = isObject(value) ? value : {};
  const kind = typeof widget.widget === 'string' ? widget.widget : '?';
  rows.push({
    at,
    depth,
    role: 'widget',
    kind,
    summary: summaryOf(widget),
    ...(slot ? { slot } : {}),
    ...(among ? { among } : {}),
  });
  if (isContainer(kind)) childRows(rows, widget.children, `${at}/children`, depth + 1);
  if (kind === 'list') {
    slotRows(rows, widget.item, `${at}/item`, 'Item', depth + 1);
    if (widget.of === 'records') slotRows(rows, widget.unknown, `${at}/unknown`, 'Unknown', depth + 1);
  }
  if (kind === 'tabs') {
    const tabs = list(widget.tabs);
    tabs.forEach((tab, index) => {
      const tabAt = `${at}/tabs/${index}`;
      const label = isObject(tab) ? words(tab.label) : '';
      rows.push({
        at: tabAt,
        depth: depth + 1,
        role: 'tab',
        summary: label,
        among: { list: `${at}/tabs`, index, count: tabs.length },
      });
      childRows(rows, isObject(tab) ? tab.children : [], `${tabAt}/children`, depth + 2);
    });
  }
}

function childRows(rows: Row[], children: unknown, at: string, depth: number): void {
  const items = list(children);
  for (const [index, child] of items.entries()) {
    widgetRows(rows, child, `${at}/${index}`, depth, undefined, { list: at, index, count: items.length });
  }
}

/** The name a row goes by: its slot and kind, a tab's label, or the screen. */
export function rowName(row: Row): string {
  if (row.role === 'screen') return 'Screen';
  if (row.role === 'tab') return `Tab ${row.summary || (row.among?.index ?? 0) + 1}`;
  if (row.role === 'empty') return `${row.slot}: empty`;
  const kind = isKind(row.kind) ? KIND_NAMES[row.kind] : `Unknown widget ${row.kind ?? ''}`.trim();
  return row.slot ? `${row.slot}: ${kind}` : kind;
}
