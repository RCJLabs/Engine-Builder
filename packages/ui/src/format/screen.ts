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

export type Action =
  | { readonly take: string; readonly args?: Readonly<Record<string, Value>> }
  | { readonly open: string }
  | { readonly close: true };

/** Where a list's entries come from: the kits' views and what is on offer. */
export const SOURCES = ['talk', 'event', 'shelf', 'bag', 'journal', 'offered'] as const;
export type Source = (typeof SOURCES)[number];

/** The fields each source's entries have, which an item's templates name as `{.field}`. */
export const SOURCE_FIELDS: Readonly<Record<Source, readonly string[]>> = {
  talk: ['label', 'locked', 'why', 'cost', 'odds'],
  event: ['label', 'locked', 'why', 'cost', 'odds'],
  shelf: ['item', 'name', 'price', 'count'],
  bag: ['item', 'name', 'count', 'price'],
  journal: ['quest', 'name', 'state', 'log', 'objectives'],
  offered: ['type', 'label'],
};

/** The kit a source needs on, if any. */
export const SOURCE_KITS: Readonly<Record<Source, string | undefined>> = {
  talk: 'dialogue',
  event: 'events',
  shelf: 'economy',
  bag: 'inventory',
  journal: 'quests',
  offered: undefined,
};

/** The views' own fields that templates may name beside facts: the open talk's line, the open event, the open shop. */
export const VIEW_FIELDS: Readonly<Record<string, string | undefined>> = {
  'talk.name': 'dialogue',
  'talk.speaker': 'dialogue',
  'talk.text': 'dialogue',
  'event.name': 'events',
  'event.text': 'events',
  'shop.name': 'economy',
};

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
  | (Base & { readonly widget: 'list'; readonly of: Source; readonly item: Widget; readonly empty?: string })
  | (Base & {
      readonly widget: 'tabs';
      readonly tabs: readonly { readonly label: string; readonly children: readonly Widget[] }[];
    })
  /** The lines feedback said to the log, newest first (M4.2, docs/specs/input.md#the-log). */
  | (Base & { readonly widget: 'log'; readonly lines?: number; readonly label?: string; readonly empty?: string });

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
      return [widget.item];
    case 'tabs':
      return widget.tabs.flatMap((tab) => tab.children);
    default:
      return [];
  }
}
