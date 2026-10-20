/**
 * Templates filled from a view (docs/specs/screens.md#bindings), and what a button takes. Plain
 * functions of the view the worker sent, so what a screen shows is what the sim reported.
 */
import { type Action, canonicalJson } from '@eb/core';
import type { Action as ScreenAction, Widget } from '../format/screen.ts';
import { splitTemplate } from '../format/template.ts';
import type { Entry, Shown, View } from '../session/types.ts';

/** How a value reads on screen: no value is a dash, yes and no are words. */
export function shownText(value: Shown | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

/** A template with its bindings filled. One that doesn't split is shown as written: the compiler said why. */
export function fill(template: string, view: View, entry?: Entry): string {
  const split = splitTemplate(template);
  if (!split.ok) return template;
  return split.segments
    .map((segment) => {
      if (segment.kind === 'text') return segment.text;
      // A codex entry's own facts, those naming @entry, are read for it (M4.4).
      if (segment.kind === 'fact') return shownText(ownOr(entry?.facts, view.facts, segment.text));
      if (segment.kind === 'view') return shownText(view.fields[segment.name]);
      return shownText(entry?.fields[segment.name]);
    })
    .join('');
}

/** A number field: a number as written, or a binding's value when it is a number. */
export function amount(value: number | string, view: View, entry?: Entry): number | null {
  if (typeof value === 'number') return value;
  const filled = Number(fill(value, view, entry));
  return Number.isFinite(filled) ? filled : null;
}

function ownOr<T>(own: Readonly<Record<string, T>> | undefined, view: Readonly<Record<string, T>>, key: string) {
  return own !== undefined && Object.hasOwn(own, key) ? own[key] : view[key];
}

/** Whether a widget is drawn: its shows-when holds, for its codex entry where it names one. Unknown is not holding. */
export const holds = (widget: Widget, view: View, entry?: Entry): boolean => {
  const when = widget['shows-when'];
  return when === undefined || ownOr(entry?.conditions, view.conditions, when) === true;
};

const matches = (offer: Action, type: string, args: Readonly<Record<string, unknown>> | undefined) =>
  offer.type === type &&
  Object.entries(args ?? {}).every(([key, value]) => canonicalJson(offer[key]) === canonicalJson(value));

/**
 * The action a button takes now, or undefined while none it names is on offer, which disables it.
 * With no arguments given, the first on offer of its type. While a step is on its way (`busy`),
 * none: the view it was drawn from is about to change, and a second press would act on the old one.
 */
export function actionFor(action: ScreenAction, view: View, entry?: Entry, busy = false): Action | undefined {
  if (!('take' in action) || busy) return undefined;
  if (action.take === 'entry') return entry?.enabled ? entry.action : undefined;
  return view.offered.find((offer) => matches(offer, action.take, action.args));
}
