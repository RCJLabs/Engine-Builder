/**
 * What the outline's actions do to a screen's JSON (M4.5, docs/specs/designer.md#the-outline):
 * add, duplicate, move up, down, in and out, drag, wrap, delete, and add a tab. Each gives the
 * screen after it and what to select, or null where the action doesn't apply to the row.
 */
import { moveItem } from '../forms/values.ts';
import { pathOf, setAt, valueAt } from './paths.ts';
import { isContainer, type Row } from './tree.ts';
import { newWidget, type WidgetKind } from './widgets.ts';

export interface Edited {
  readonly screen: unknown;
  readonly selected: string;
}

type Place =
  | { readonly kind: 'slot'; readonly at: string }
  | { readonly kind: 'list'; readonly list: string; readonly index: number };

const list = (screen: unknown, at: string): readonly unknown[] => {
  const value = valueAt(screen, at);
  return Array.isArray(value) ? value : [];
};
const setList = (screen: unknown, at: string, items: readonly unknown[]) => setAt(screen, pathOf(screen, at), items);

/**
 * Where Add puts a widget for the row: into an empty slot; at the end of a container's or a tab's
 * children; after a widget among others. A widget alone in a slot that holds nothing has none:
 * Wrap puts it in a stack first.
 */
export function addPlace(screen: unknown, row: Row): Place | null {
  if (row.role === 'empty') return { kind: 'slot', at: row.at };
  if (row.role === 'tab' || (row.role === 'widget' && isContainer(row.kind))) {
    const children = `${row.at}/children`;
    return { kind: 'list', list: children, index: list(screen, children).length };
  }
  if (row.role === 'widget' && row.among) return { kind: 'list', list: row.among.list, index: row.among.index + 1 };
  return null;
}

/** A new widget of `kind` where Add puts one. */
export function addWidget(screen: unknown, row: Row, kind: WidgetKind): Edited | null {
  const place = addPlace(screen, row);
  if (!place) return null;
  const widget = newWidget(kind);
  if (place.kind === 'slot') return { screen: setAt(screen, pathOf(screen, place.at), widget), selected: place.at };
  const items = [...list(screen, place.list)];
  items.splice(place.index, 0, widget);
  return { screen: setList(screen, place.list, items), selected: `${place.list}/${place.index}` };
}

/** A copy of a widget among others, just after it. */
export function duplicate(screen: unknown, row: Row): Edited | null {
  if (row.role !== 'widget' || !row.among) return null;
  const { list: at, index } = row.among;
  const items = [...list(screen, at)];
  items.splice(index + 1, 0, structuredClone(items[index]));
  return { screen: setList(screen, at, items), selected: `${at}/${index + 1}` };
}

/** A widget or a tab moved to `to` among its siblings: Up, Down and the drag. */
export function moveTo(screen: unknown, row: Row, to: number): Edited | null {
  if (!row.among || to < 0 || to >= row.among.count || to === row.among.index) return null;
  const { list: at, index } = row.among;
  return { screen: setList(screen, at, moveItem(list(screen, at), index, to)), selected: `${at}/${to}` };
}

export const moveBy = (screen: unknown, row: Row, by: -1 | 1): Edited | null =>
  row.among ? moveTo(screen, row, row.among.index + by) : null;

/** A widget moved into the container just before it, as its last child. */
export function moveIn(screen: unknown, row: Row): Edited | null {
  if (row.role !== 'widget' || !row.among || row.among.index === 0) return null;
  const { list: at, index } = row.among;
  const before = `${at}/${index - 1}`;
  const owner = valueAt(screen, before) as { widget?: unknown } | undefined;
  if (!isContainer(owner?.widget)) return null;
  const items = [...list(screen, at)];
  const [moved] = items.splice(index, 1);
  const inside = `${before}/children`;
  const children = list(screen, inside);
  const next = setList(setList(screen, at, items), inside, [...children, moved]);
  return { screen: next, selected: `${inside}/${children.length}` };
}

/** The widget a list of children belongs to: a container, or for a tab's children, its tabs widget. */
const ownerOf = (childList: string): string => childList.replace(/\/children$/, '').replace(/\/tabs\/\d+$/, '');

/** A widget moved out of its container, to just after it, where the container sits among others. */
export function moveOut(screen: unknown, row: Row): Edited | null {
  if (row.role !== 'widget' || !row.among) return null;
  const owner = ownerOf(row.among.list);
  const sits = /^(.*\/children)\/(\d+)$/.exec(owner);
  if (!sits) return null;
  const [, outer = '', place = '0'] = sits;
  const items = [...list(screen, row.among.list)];
  const [moved] = items.splice(row.among.index, 1);
  const without = setList(screen, row.among.list, items);
  const around = [...list(without, outer)];
  const index = Number(place) + 1;
  around.splice(index, 0, moved);
  return { screen: setList(without, outer, around), selected: `${outer}/${index}` };
}

/** A widget put inside a new stack, in its place: what lets a slot's one widget have company. */
export function wrap(screen: unknown, row: Row): Edited | null {
  if (row.role !== 'widget') return null;
  const path = pathOf(screen, row.at);
  return { screen: setAt(screen, path, { widget: 'stack', children: [valueAt(screen, row.at)] }), selected: row.at };
}

/**
 * A widget or a tab deleted. A slot's widget leaves the slot empty; one among others, the next
 * selected, or the last one's container, or its tab, or its tabs widget.
 */
export function remove(screen: unknown, row: Row): Edited | null {
  if (row.role === 'screen' || row.role === 'empty') return null;
  if (!row.among) return { screen: setAt(screen, pathOf(screen, row.at), undefined), selected: row.at };
  const { list: at, index, count } = row.among;
  const items = list(screen, at).filter((_, i) => i !== index);
  const selected = count > 1 ? `${at}/${Math.min(index, count - 2)}` : at.replace(/\/(children|tabs)$/, '');
  return { screen: setList(screen, at, items), selected };
}

/** A new tab at the end of a tabs widget's, from the widget's row or one of its tabs'. */
export function addTab(screen: unknown, row: Row): Edited | null {
  const at =
    row.role === 'tab' ? row.among?.list : row.role === 'widget' && row.kind === 'tabs' ? `${row.at}/tabs` : null;
  if (!at) return null;
  const tabs = list(screen, at);
  return {
    screen: setList(screen, at, [...tabs, { label: `Tab ${tabs.length + 1}`, children: [] }]),
    selected: `${at}/${tabs.length}`,
  };
}
