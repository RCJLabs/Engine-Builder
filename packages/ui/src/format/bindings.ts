/**
 * What a game's screens name, gathered for the session (docs/specs/screens.md#session): every
 * fact a template or a number binds, and every `shows-when`. The worker reads these after each
 * step and sends their values, so the page never reads the sim's state itself.
 */
import { childrenOf, REGIONS, type Screen, type Widget } from './screen.ts';
import { splitTemplate } from './template.ts';

export interface Wants {
  /** Facts as conditions write them, sorted: the keys of a view's `facts`. */
  readonly facts: readonly string[];
  /** Conditions as written, sorted: the keys of a view's `conditions`. */
  readonly conditions: readonly string[];
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

/** The facts and conditions a set of screens names. A template that doesn't split names nothing. */
export function wantsOf(screens: Iterable<Screen>): Wants {
  const facts = new Set<string>();
  const conditions = new Set<string>();
  for (const screen of screens) {
    for (const widget of widgetsOf(screen)) {
      if (widget['shows-when'] !== undefined) conditions.add(widget['shows-when']);
      for (const template of templatesOf(widget)) {
        const split = splitTemplate(template);
        if (!split.ok) continue;
        for (const segment of split.segments) if (segment.kind === 'fact') facts.add(segment.text);
      }
    }
  }
  const sorted = (set: Set<string>) => [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { facts: sorted(facts), conditions: sorted(conditions) };
}
