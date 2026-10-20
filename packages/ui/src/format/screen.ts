/**
 * A screen as its file holds it (docs/specs/screens.md): three regions of widgets, the modes it
 * is the screen for, and whether it is drawn over the one below. Plain data, as the compiler
 * checks it and the renderer draws it.
 */
import type { Value } from '@eb/core';

export const BREAKPOINTS = ['phone', 'landscape', 'tablet', 'desktop'] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];

export const DIRECTIONS = ['column', 'row'] as const;
export const ALIGNS = ['start', 'center', 'end', 'stretch'] as const;
export const JUSTIFIES = ['start', 'center', 'end', 'between'] as const;
export const TEXT_STYLES = ['title', 'heading', 'body', 'caption'] as const;
export const BUTTON_STYLES = ['primary', 'plain'] as const;

/** What a widget's `at` may change at a breakpoint: its layout, never its content. */
export interface Layout {
  readonly direction?: (typeof DIRECTIONS)[number];
  /** In the theme's spacing steps. */
  readonly gap?: number;
  readonly align?: (typeof ALIGNS)[number];
  readonly justify?: (typeof JUSTIFIES)[number];
  readonly wrap?: boolean;
  readonly columns?: number;
}

/** Where a button can send the player in the play shell (M4.4, D54): its title, or its New game. */
export const SHELL_GOES = ['title', 'new'] as const;
export type ShellGo = (typeof SHELL_GOES)[number];

export type Action =
  | { readonly take: string; readonly args?: Readonly<Record<string, Value>> }
  | { readonly open: string }
  | { readonly close: true }
  | { readonly shell: ShellGo };

/**
 * Where a list's entries come from: the kits' views, what is on offer, and since M4.4 the records
 * of a type (a codex's) and the assets' credits the pack carries.
 */
export const SOURCES = ['talk', 'event', 'shelf', 'bag', 'journal', 'offered', 'records', 'credits'] as const;
export type Source = (typeof SOURCES)[number];

/** Sources whose entries come with no action, so `{"take": "entry"}` has nothing to take. */
export const NO_ACTION: readonly Source[] = ['journal', 'records', 'credits'];

/** In a `records` list, a fact's argument that is its entry's record (M4.4), as a quest's `@slot` is its slot's. */
export const ENTRY = '@entry';
/** The name `@entry` goes by where conditions name slots. */
export const ENTRY_SLOT = 'entry';

/** The fields each source's entries have, which an item's templates name as `{.field}`. */
export const SOURCE_FIELDS: Readonly<Record<Source, readonly string[]>> = {
  talk: ['label', 'locked', 'why', 'cost', 'odds'],
  event: ['label', 'locked', 'why', 'cost', 'odds'],
  shelf: ['item', 'name', 'price', 'count'],
  bag: ['item', 'name', 'count', 'price'],
  journal: ['quest', 'name', 'state', 'log', 'objectives'],
  offered: ['type', 'label'],
  // And the record's own fields whose values are text, numbers or yes/no: its type says which.
  records: ['id', 'name'],
  credits: ['asset', 'author', 'licence', 'source', 'tool'],
};

/** The kit a source needs on, if any. */
export const SOURCE_KITS: Readonly<Record<Source, string | undefined>> = {
  talk: 'dialogue',
  event: 'events',
  shelf: 'economy',
  bag: 'inventory',
  journal: 'quests',
  offered: undefined,
  records: undefined,
  credits: undefined,
};

/** The views' own fields that templates may name beside facts: the open talk's line, the open event, the open shop. */
export const VIEW_FIELDS: Readonly<Record<string, string | undefined>> = {
  'talk.name': 'dialogue',
  'talk.speaker': 'dialogue',
  'talk.text': 'dialogue',
  'event.name': 'events',
  'event.text': 'events',
  'shop.name': 'economy',
  'map.name': 'maps',
};

/** The kit a widget kind needs on, if any: the map widget draws the maps kit's map (M4.6). */
export const WIDGET_KITS: Readonly<Partial<Record<string, string>>> = { map: 'maps' };

interface Base {
  /** A condition in the engine's text form: the widget is drawn only while it holds. */
  readonly 'shows-when'?: string;
  readonly at?: Partial<Readonly<Record<Breakpoint, Layout>>>;
}

export type Widget =
  | (Base & {
      readonly widget: 'stack';
      readonly children: readonly Widget[];
      readonly direction?: Layout['direction'];
      readonly gap?: number;
      readonly align?: Layout['align'];
      readonly justify?: Layout['justify'];
      readonly wrap?: boolean;
    })
  | (Base & {
      readonly widget: 'panel';
      readonly children: readonly Widget[];
      readonly direction?: Layout['direction'];
      readonly gap?: number;
    })
  | (Base & {
      readonly widget: 'grid';
      readonly children: readonly Widget[];
      readonly columns: number;
      readonly gap?: number;
    })
  | (Base & { readonly widget: 'text'; readonly text: string; readonly style?: (typeof TEXT_STYLES)[number] })
  | (Base & { readonly widget: 'image'; readonly asset: string; readonly alt: string })
  | (Base & {
      readonly widget: 'button';
      readonly label: string;
      readonly action: Action;
      readonly style?: (typeof BUTTON_STYLES)[number];
    })
  | (Base & {
      readonly widget: 'progress';
      readonly value: number | string;
      readonly max: number | string;
      readonly label: string;
    })
  | (Base & {
      readonly widget: 'list';
      readonly of: Source;
      readonly item: Widget;
      readonly empty?: string;
      /** A `records` list's record type (M4.4). */
      readonly type?: string;
      /** A `records` list's condition on `@entry`: until it holds, the entry is held back. */
      readonly known?: string;
      /** What a `records` list draws for an entry held back, showing nothing of its record. */
      readonly unknown?: Widget;
    })
  | (Base & {
      readonly widget: 'tabs';
      readonly tabs: readonly { readonly label: string; readonly children: readonly Widget[] }[];
    })
  /** The lines feedback said to the log, newest first (M4.2, docs/specs/input.md#the-log). */
  | (Base & { readonly widget: 'log'; readonly lines?: number; readonly label?: string; readonly empty?: string })
  /**
   * The map the party is on, its nodes as buttons and each move to the picked one (M4.6, D56,
   * docs/specs/maps.md#the-map-widget). `label` names it; `empty` is shown before a map is entered.
   */
  | (Base & { readonly widget: 'map'; readonly label?: string; readonly empty?: string });

export type WidgetKind = Widget['widget'];
export const WIDGETS: readonly WidgetKind[] = [
  'stack',
  'panel',
  'grid',
  'text',
  'image',
  'button',
  'progress',
  'list',
  'tabs',
  'log',
  'map',
];

/** How many lines a log widget shows unless it says, and the most it may. */
export const LOG_LINES = 10;
export const LOG_LINES_MAX = 100;

export const REGIONS = ['top', 'main', 'bottom'] as const;
export type Region = (typeof REGIONS)[number];

export interface Screen {
  readonly title?: string;
  /** The game's modes this is the screen for. Empty or left out: opened only by a button. */
  readonly shows?: readonly string[];
  readonly modal?: boolean;
  readonly top?: Widget;
  readonly main: Widget;
  readonly bottom?: Widget;
}

/** The widgets a widget holds, in order: what a walk over a screen descends into. */
export function childrenOf(widget: Widget): readonly Widget[] {
  switch (widget.widget) {
    case 'stack':
    case 'panel':
    case 'grid':
      return widget.children;
    case 'list':
      return widget.unknown === undefined ? [widget.item] : [widget.item, widget.unknown];
    case 'tabs':
      return widget.tabs.flatMap((tab) => tab.children);
    default:
      return [];
  }
}

export type ListWidget = Extract<Widget, { widget: 'list' }>;

/**
 * The key a list's entries go by in a view: its source, or for a `records` list its type and its
 * `known` too, since two such lists of one type can hold different entries back.
 */
export const listKey = (list: Pick<ListWidget, 'of' | 'type' | 'known'>): string =>
  list.of === 'records' ? `records:${list.type ?? ''}:${list.known ?? ''}` : list.of;

/** Whether a fact or condition as written names `@entry`, so it is read for each entry of its list. */
export const namesEntry = (text: string): boolean => /@entry(?![a-z0-9-])/.test(text);
