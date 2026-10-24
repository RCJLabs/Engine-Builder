/**
 * Each widget kind as the designer edits it (M4.5, D55, docs/specs/designer.md#the-form): its
 * fields, as the record form's field models so its own field components draw them; what a new one
 * holds; and the one key order every widget is written in, so the files read as the fixtures do.
 */
import type { FieldDef, TypeFile } from '@eb/schema';
import {
  ALIGNS,
  BUTTON_STYLES,
  DIRECTIONS,
  JUSTIFIES,
  LOG_LINES_MAX,
  SOURCES,
  TEXT_STYLES,
  WIDGETS,
  type WidgetKind,
} from '@eb/ui/format';

export type { WidgetKind };
export { WIDGETS };

/** Fields that lay a widget out, which `at` may change at a breakpoint. */
export const LAYOUT_FIELDS = ['direction', 'gap', 'align', 'justify', 'wrap', 'columns'] as const;
export type LayoutField = (typeof LAYOUT_FIELDS)[number];

const choice = (values: readonly string[], label: string, description?: string): FieldDef => ({
  kind: 'enum',
  values,
  optional: true,
  label,
  ...(description ? { description } : {}),
});
const LAYOUT: Readonly<Record<LayoutField, FieldDef>> = {
  direction: choice(DIRECTIONS, 'Direction', 'Column, the default, puts its widgets under each other.'),
  gap: { kind: 'int', min: 0, max: 8, optional: true, label: 'Gap', description: 'In the theme’s spacing steps.' },
  align: choice(ALIGNS, 'Align', 'Across the direction.'),
  justify: choice(JUSTIFIES, 'Justify', 'Along the direction.'),
  wrap: { kind: 'bool', optional: true, label: 'Wrap' },
  columns: { kind: 'int', min: 1, max: 12, label: 'Columns' },
};
const SHOWS_WHEN: FieldDef = {
  kind: 'condition',
  optional: true,
  label: 'Shows when',
  description: 'Drawn only while this holds, like time.day >= 10.',
};
const facts = 'Facts go in braces, like {time.day}.';

/** A kind's own fields, in the order the form shows them and the file holds them. Layout first, where it has any. */
const OWN: Readonly<Record<WidgetKind, Readonly<Record<string, FieldDef>>>> = {
  stack: {
    direction: LAYOUT.direction,
    gap: LAYOUT.gap,
    align: LAYOUT.align,
    justify: LAYOUT.justify,
    wrap: LAYOUT.wrap,
  },
  panel: { direction: LAYOUT.direction, gap: LAYOUT.gap },
  grid: { columns: LAYOUT.columns, gap: LAYOUT.gap },
  text: {
    text: { kind: 'text', multiline: true, label: 'Text', description: facts },
    style: choice(TEXT_STYLES, 'Style', 'Body, the default, is plain text.'),
  },
  image: {
    asset: { kind: 'asset', of: 'image', label: 'Image' },
    alt: { kind: 'text', label: 'Alt text', description: 'What the image shows, for screen readers. Facts in braces.' },
  },
  button: {
    label: { kind: 'text', label: 'Label', description: facts },
    detail: {
      kind: 'text',
      optional: true,
      label: 'Second line',
      description: 'Smaller, under the label, and left out while its facts are empty: a choice’s {.odds}.',
    },
    style: choice(BUTTON_STYLES, 'Style', 'Plain, the default, or primary for the main thing to do.'),
  },
  progress: {
    label: { kind: 'text', label: 'Label', description: facts },
  },
  list: {
    of: { kind: 'enum', values: SOURCES, label: 'Lists' },
    empty: { kind: 'text', optional: true, label: 'When empty', description: 'Shown when the list has nothing in it.' },
  },
  tabs: {},
  log: {
    lines: { kind: 'int', min: 1, max: LOG_LINES_MAX, optional: true, label: 'Lines', description: 'Ten unless set.' },
    label: { kind: 'text', optional: true, label: 'Label', description: 'What a screen reader calls it.' },
    empty: { kind: 'text', optional: true, label: 'When empty' },
  },
  map: {
    label: {
      kind: 'text',
      optional: true,
      label: 'Label',
      description: 'What a screen reader calls it: the map’s name unless set.',
    },
    empty: { kind: 'text', optional: true, label: 'When empty', description: 'Shown before a map is entered.' },
  },
  // M5.8: the form offers the project's spaces for `space` (WidgetForm.tsx).
  space: {
    space: { kind: 'text', label: 'Space', description: 'The space walked here, from spaces/.' },
    label: {
      kind: 'text',
      optional: true,
      label: 'Label',
      description: 'What a screen reader calls it: the space’s name unless set.',
    },
  },
};

/** A `records` list's own fields, which only it has (M4.4). */
export const RECORDS_FIELDS: Readonly<Record<string, FieldDef>> = {
  type: { kind: 'text', label: 'Record type' },
  known: {
    kind: 'condition',
    optional: true,
    label: 'Known when',
    description: 'Each record is held back until this holds; name the record as @entry.',
  },
};

/** An `offered` list's own field, which only it has (M4.12). */
export const OFFERED_FIELDS: Readonly<Record<string, FieldDef>> = {
  takes: {
    kind: 'list',
    of: { kind: 'text' },
    optional: true,
    label: 'Only these actions',
    description: 'Action types, or a module’s as module/*: only those are listed. Everything on offer when empty.',
  },
};

/** The fields the form shows for a kind, without its action, amounts and shows-when, which have fields of their own. */
export const fieldsOf = (kind: WidgetKind): Readonly<Record<string, FieldDef>> => OWN[kind];

/** A kind's fields as a type file, which the record form's field components read their models from. */
export function typeFileOf(kind: WidgetKind): TypeFile {
  return {
    title: kind,
    fields: {
      ...OWN[kind],
      ...(kind === 'list' ? { ...RECORDS_FIELDS, ...OFFERED_FIELDS } : {}),
      'shows-when': SHOWS_WHEN,
    },
  };
}

/** The key order of every widget: its kind, its own fields, then what all have, then what it holds. */
const BEFORE = ['widget'];
const AFTER = ['style', 'action', 'shows-when', 'at'];
const HOLDS = ['children', 'item', 'unknown', 'tabs'];
const SPECIAL: Partial<Record<WidgetKind, readonly string[]>> = {
  progress: ['value', 'max', 'label'],
  list: ['of', 'type', 'known', 'takes', 'empty'],
};

export function widgetKeys(kind: string): readonly string[] {
  const own = SPECIAL[kind as WidgetKind] ?? Object.keys(OWN[kind as WidgetKind] ?? {});
  return [...BEFORE, ...own.filter((key) => !AFTER.includes(key)), ...AFTER, ...HOLDS];
}

export const SCREEN_KEYS = ['title', 'shows', 'modal', 'top', 'main', 'bottom', 'ambience', 'music'] as const;
export const TAB_KEYS = ['label', 'children'] as const;
export const ACTION_KEYS = ['take', 'args', 'open', 'close', 'shell'] as const;
export const AT_KEYS = ['phone', 'landscape', 'tablet', 'desktop'] as const;

/** What a new widget of each kind holds: enough to draw, and what is left to fill in the checks say. */
export function newWidget(kind: WidgetKind): Record<string, unknown> {
  switch (kind) {
    case 'stack':
    case 'panel':
      return { widget: kind, children: [] };
    case 'grid':
      return { widget: kind, columns: 2, children: [] };
    case 'text':
      return { widget: kind, text: 'Text' };
    case 'image':
      return { widget: kind, asset: '', alt: '' };
    case 'button':
      return { widget: kind, label: 'Button', action: { take: '' } };
    case 'progress':
      return { widget: kind, value: 0, max: 10, label: 'Progress' };
    case 'list':
      return { widget: kind, of: 'offered', item: { widget: 'text', text: '{.label}' } };
    case 'tabs':
      return { widget: kind, tabs: [{ label: 'Tab 1', children: [] }] };
    case 'log':
    case 'map':
      return { widget: kind };
    case 'space':
      return { widget: kind, space: '' };
  }
}

/** A screen's modes with one ticked or not; none left is the same as no `shows` at all, so the key goes. */
export function withMode(shows: readonly string[], mode: string, on: boolean): string[] | undefined {
  const next = on ? [...shows.filter((m) => m !== mode), mode] : shows.filter((m) => m !== mode);
  return next.length === 0 ? undefined : next;
}

/** The kinds that hold children of their own, which Add puts a widget inside. */
export const CONTAINERS: readonly WidgetKind[] = ['stack', 'panel', 'grid'];

/** The words a kind goes by in the outline and its menus. */
export const KIND_NAMES: Readonly<Record<WidgetKind, string>> = {
  stack: 'Stack',
  panel: 'Panel',
  grid: 'Grid',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  progress: 'Progress bar',
  list: 'List',
  tabs: 'Tabs',
  log: 'Log',
  map: 'Map',
  space: 'Space',
};
