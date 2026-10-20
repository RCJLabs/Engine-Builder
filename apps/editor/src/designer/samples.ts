/**
 * What the frame draws where the moment has nothing (M4.5, D55, docs/specs/designer.md#what-the-frame-draws):
 * three sample entries for a list whose source doesn't apply, each field reading its own name;
 * the views' own fields the same; and, with no game to read, every fact by its name and every
 * shows-when holding, so the whole screen is drawn.
 */
import type { LogLine } from '@eb/ui';
import {
  childrenOf,
  type ListWidget,
  listKey,
  type Screen,
  SOURCE_FIELDS,
  splitTemplate,
  templatesOf,
  VIEW_FIELDS,
  type Widget,
  wantsOf,
  widgetsOf,
} from '@eb/ui/format';
import type { Entry, Shown, View } from '@eb/ui/session';

export const SAMPLES = 3;

/** How a sample reads: the name of what it stands for, in marks no game's text has. */
export const sample = (name: string): string => `‹${name}›`;

/** The `{.field}`s an item names, in it and the widgets inside it. */
function entryFieldsOf(item: Widget): string[] {
  const names = new Set<string>();
  const visit = (widget: Widget) => {
    for (const template of templatesOf(widget)) {
      const split = splitTemplate(template);
      if (split.ok) for (const s of split.segments) if (s.kind === 'field') names.add(s.name);
    }
    for (const child of childrenOf(widget)) visit(child);
  };
  visit(item);
  return [...names];
}

/** Three entries for a list the moment has none of, each field it has or its item names reading its own name. */
export function sampleEntries(list: ListWidget): Entry[] {
  const fields = [...new Set([...(SOURCE_FIELDS[list.of] ?? []), ...entryFieldsOf(list.item)])];
  return Array.from({ length: SAMPLES }, (_, i) => ({
    key: `sample-${i + 1}`,
    fields: Object.fromEntries(fields.map((name) => [name, sample(name)])),
    enabled: false,
  }));
}

const lists = (screen: Screen): ListWidget[] =>
  widgetsOf(screen).filter((widget): widget is ListWidget => widget.widget === 'list');

/** The moment's view, with samples where it has nothing: lists whose source doesn't apply, and the views' fields. */
export function withSamples(view: View, screen: Screen): View {
  const filled: Record<string, readonly Entry[]> = { ...view.lists };
  for (const list of lists(screen)) filled[listKey(list)] ??= sampleEntries(list);
  const fields: Record<string, Shown> = { ...view.fields };
  for (const name of Object.keys(VIEW_FIELDS)) fields[name] ??= sample(name);
  return { ...view, fields, lists: filled };
}

/** With no game to read: every fact by its name, every shows-when holding, every list sampled. */
export function sampleView(screen: Screen): View {
  const wants = wantsOf([screen]);
  const facts = [...wants.facts, ...(wants.records ?? []).flatMap((codex) => codex.facts)];
  const conditions = [...wants.conditions, ...(wants.records ?? []).flatMap((codex) => codex.conditions)];
  const empty: View = {
    modes: [],
    offered: [],
    facts: Object.fromEntries(facts.map((fact) => [fact, sample(fact)])),
    conditions: Object.fromEntries(conditions.map((condition) => [condition, true])),
    fields: {},
    lists: {},
    turn: 0,
    ended: false,
  };
  return withSamples(empty, screen);
}

/** The lines a log widget shows in the frame: the play's own are the Play panel's, so samples. */
export const SAMPLE_LOG: readonly LogLine[] = Array.from({ length: SAMPLES }, (_, i) => ({
  n: i + 1,
  text: sample('a line of feedback'),
}));
