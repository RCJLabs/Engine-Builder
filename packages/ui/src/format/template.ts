/**
 * A template's text and bindings (docs/specs/screens.md#bindings): `"Day {time.day}"` is the text
 * "Day " and the fact `time.day`. A binding is a fact as conditions write it, a view's field such
 * as `{talk.text}`, or, in a list's item, the entry's field as `{.price}`. What a binding names is
 * the compiler's to check; this only splits the text.
 */
import { VIEW_FIELDS } from './screen.ts';

export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'fact'; readonly text: string; readonly at: number }
  | { readonly kind: 'view'; readonly name: string }
  | { readonly kind: 'field'; readonly name: string };

export type Split =
  | { readonly ok: true; readonly segments: readonly Segment[] }
  | { readonly ok: false; readonly message: string; readonly at: number };

/** The template's text and bindings, or where its braces go wrong. */
export function splitTemplate(template: string): Split {
  const segments: Segment[] = [];
  let text = '';
  for (let i = 0; i < template.length; i++) {
    const char = template[i];
    if (char === '}') return { ok: false, message: 'This } closes nothing', at: i };
    if (char !== '{') {
      text += char;
      continue;
    }
    const close = template.indexOf('}', i + 1);
    const nested = template.indexOf('{', i + 1);
    if (close < 0) return { ok: false, message: 'This { isn’t closed', at: i };
    if (nested >= 0 && nested < close) return { ok: false, message: 'A { inside { … } isn’t read', at: nested };
    const inner = template.slice(i + 1, close).trim();
    if (inner === '') return { ok: false, message: 'Name a fact between the braces, like {time.day}', at: i };
    if (text !== '') segments.push({ kind: 'text', text });
    text = '';
    segments.push(bindingOf(inner, i + 1));
    i = close;
  }
  if (text !== '') segments.push({ kind: 'text', text });
  return { ok: true, segments };
}

function bindingOf(inner: string, at: number): Segment {
  if (inner.startsWith('.')) return { kind: 'field', name: inner.slice(1) };
  if (inner in VIEW_FIELDS) return { kind: 'view', name: inner };
  return { kind: 'fact', text: inner, at };
}

/** A template with no bindings is shown as written: the facts in one, as their values. */
export function hasBindings(template: string): boolean {
  return template.includes('{');
}
