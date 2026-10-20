/**
 * What a game's screens name, gathered for the session (docs/specs/screens.md#session): every
 * fact a template or a number binds, and every `shows-when`. The worker reads these after each
 * step and sends their values, so the page never reads the sim's state itself. Those that name a
 * codex's `@entry` are read for each of its entries instead (M4.4).
 */
import { childrenOf, type ListWidget, listKey, namesEntry, REGIONS, type Screen, type Widget } from './screen.ts';
import { splitTemplate } from './template.ts';

/** A `records` list's entries, and what its item reads for each (M4.4, D54). */
export interface RecordsWant {
  /** listKey's: the key the view's lists hold its entries by. */
  readonly key: string;
  readonly type: string;
  /** Its `known`, as written. */
  readonly known?: string;
  /** The facts its item reads for each entry, `@entry` among their arguments, sorted. */
  readonly facts: readonly string[];
  /** The `shows-when`s in its item that name `@entry`, sorted. */
  readonly conditions: readonly string[];
}

export interface Wants {
  /** Facts as conditions write them, sorted: the keys of a view's `facts`. */
  readonly facts: readonly string[];
  /** Conditions as written, sorted: the keys of a view's `conditions`. */
  readonly conditions: readonly string[];
  /** The codex lists, by key (M4.4). None when the screens have none. */
  readonly records?: readonly RecordsWant[];
}

/** Each template a widget shows, and its numbers that are bindings. */
export function templatesOf(widget: Widget): readonly string[] {
  switch (widget.widget) {
    case 'text':
      return [widget.text];
    case 'button':
      return [widget.label];
    case 'progress':
      return [widget.label, ...[widget.value, widget.max].filter((v): v is string => typeof v === 'string')];
    case 'list':
      return widget.empty === undefined ? [] : [widget.empty];
    case 'tabs':
      return widget.tabs.map((tab) => tab.label);
    case 'log':
      return [widget.label, widget.empty].filter((t): t is string => t !== undefined);
    default:
      return [];
  }
}

function walk(widget: Widget, visit: (widget: Widget) => void): void {
  visit(widget);
  for (const child of childrenOf(widget)) walk(child, visit);
}

/** Every widget of a screen, region by region, depth first. */
export function widgetsOf(screen: Screen): Widget[] {
  const widgets: Widget[] = [];
  for (const region of REGIONS) {
    const root = screen[region];
    if (root) walk(root, (w) => widgets.push(w));
  }
  return widgets;
}

interface Gathered {
  readonly facts: Set<string>;
  readonly conditions: Set<string>;
}

interface Codex extends Gathered {
  readonly type: string;
  readonly known?: string;
}

interface Gathering extends Gathered {
  readonly records: Map<string, Codex>;
}

const factsIn = (template: string): string[] => {
  const split = splitTemplate(template);
  return split.ok ? split.segments.flatMap((s) => (s.kind === 'fact' ? [s.text] : [])) : [];
};

/** A widget's facts and shows-when, each where it is read: for each entry of the codex list it sits in, or once. */
function gather(widget: Widget, into: Gathering, codex: Gathered | undefined): void {
  const where = (text: string) => (codex !== undefined && namesEntry(text) ? codex : into);
  const when = widget['shows-when'];
  if (when !== undefined) where(when).conditions.add(when);
  for (const template of templatesOf(widget)) for (const fact of factsIn(template)) where(fact).facts.add(fact);
  if (widget.widget === 'list' && widget.of === 'records') {
    gather(widget.item, into, codexOf(widget, into));
    // A held-back entry shows nothing of its record, so what it names is read once, as anywhere else.
    if (widget.unknown !== undefined) gather(widget.unknown, into, undefined);
    return;
  }
  for (const child of childrenOf(widget)) gather(child, into, codex);
}

function codexOf(list: ListWidget, into: Gathering): Codex {
  const key = listKey(list);
  const known = into.records.get(key);
  if (known !== undefined) return known;
  const fresh: Codex = {
    type: list.type ?? '',
    ...(list.known !== undefined ? { known: list.known } : {}),
    facts: new Set<string>(),
    conditions: new Set<string>(),
  };
  into.records.set(key, fresh);
  return fresh;
}

const sorted = (values: Iterable<string>) => [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * The facts and conditions a set of screens names, and the facts of other templates the worker
 * fills, such as the shell's slot line (M4.3). A template that doesn't split names nothing.
 */
export function wantsOf(screens: Iterable<Screen>, templates: Iterable<string> = []): Wants {
  const into: Gathering = { facts: new Set(), conditions: new Set(), records: new Map() };
  for (const screen of screens) {
    for (const region of REGIONS) {
      const root = screen[region];
      if (root) gather(root, into, undefined);
    }
  }
  for (const template of templates) for (const fact of factsIn(template)) into.facts.add(fact);
  const records = sorted(into.records.keys()).map((key) => {
    const { type, known, facts, conditions } = into.records.get(key) as Codex;
    return {
      key,
      type,
      ...(known !== undefined ? { known } : {}),
      facts: sorted(facts),
      conditions: sorted(conditions),
    };
  });
  return {
    facts: sorted(into.facts),
    conditions: sorted(into.conditions),
    ...(records.length > 0 ? { records } : {}),
  };
}
