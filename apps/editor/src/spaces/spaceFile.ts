/**
 * A space or prefab file as the editor reads and writes it (M5.1, docs/specs/viewport.md#the-files):
 * its objects' places with the defaults filled in, and the file written back one object to a line,
 * fields at their defaults left out, so moving an object changes one line of it.
 */
import { type SpaceJson, type SpaceObject, spaceSchema } from '@eb/compiler';
import { schemaIssues } from '@eb/schema';
import { type JsonLayout, layoutOf } from '../editing/jsonText.ts';
import type { Placed, Transform } from './gizmoMath.ts';
import { tidy } from './snap.ts';
import type { Vec3 } from './vec.ts';

export type { SpaceJson, SpaceObject };

// Built from its code: a formatter may turn the escape into an invisible character.
const BOM = String.fromCharCode(0xfeff);

export const ORIGIN: Vec3 = [0, 0, 0];
export const ONE: Vec3 = [1, 1, 1];
/** A shape's colour when its file gives none. */
export const GREY = '#b0b0b0';

export const transformOf = (object: SpaceObject): Transform => ({
  at: object.at ?? ORIGIN,
  turn: object.turn ?? ORIGIN,
  scale: object.scale ?? ONE,
});

export const placedOf = (object: SpaceObject): Placed => ({ id: object.id, ...transformOf(object) });

const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const tidied = (v: Vec3): [number, number, number] => [tidy(v[0]), tidy(v[1]), tidy(v[2])];

/** The object at `t`: each of at, turn and scale left out at its default. */
export function withTransform(object: SpaceObject, t: Transform): SpaceObject {
  const { at: _at, turn: _turn, scale: _scale, ...rest } = object;
  return {
    ...rest,
    ...(same(t.at, ORIGIN) ? {} : { at: tidied(t.at) }),
    ...(same(t.turn, ORIGIN) ? {} : { turn: tidied(t.turn) }),
    ...(same(t.scale, ONE) ? {} : { scale: tidied(t.scale) }),
  };
}

export const nameOf = (object: SpaceObject): string => object.name ?? object.id;

/** `base`, or `base-2`, `base-3`… whichever is free. */
export function freeId(taken: ReadonlySet<string>, base: string): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export type ReadSpace =
  | { readonly ok: true; readonly space: SpaceJson }
  | { readonly ok: false; readonly problem: string };

/** A file's text as a space: its first problem when it isn't one (E058, as eb validate says it). */
export function readSpace(text: string): ReadSpace {
  let value: unknown;
  try {
    value = JSON.parse(text.startsWith(BOM) ? text.slice(1) : text);
  } catch (error) {
    return { ok: false, problem: `It isn’t JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const [first] = schemaIssues(spaceSchema, value);
  if (first) return { ok: false, problem: `${first.path || 'The file'}: ${first.message}` };
  return { ok: true, space: value as SpaceJson };
}

/** An object's fields in the order a file lists them; any the editor doesn't know follow. */
const ORDER = ['id', 'name', 'shape', 'prefab', 'at', 'turn', 'scale', 'color'];

function objectLine(object: SpaceObject): string {
  const keys = [...ORDER.filter((key) => key in object), ...Object.keys(object).filter((key) => !ORDER.includes(key))];
  const fields = keys.map((key) => {
    const value = (object as Record<string, unknown>)[key];
    const text = Array.isArray(value) ? `[${value.map((v) => JSON.stringify(v)).join(', ')}]` : JSON.stringify(value);
    return `${JSON.stringify(key)}: ${text}`;
  });
  return `{ ${fields.join(', ')} }`;
}

const FRESH: JsonLayout = { bom: false, eol: '\n', indent: '  ', finalNewline: true };

/** A space's text, one object to a line, in `layout`'s line ends, indent and last newline. */
export function spaceText(space: SpaceJson, layout: JsonLayout = FRESH): string {
  const indent = layout.indent === '' ? '  ' : layout.indent;
  const { eol } = layout;
  const objects =
    space.objects.length === 0
      ? '[]'
      : `[${eol}${space.objects.map((o) => `${indent}${indent}${objectLine(o)}`).join(`,${eol}`)}${eol}${indent}]`;
  const others = Object.entries(space)
    .filter(([key]) => key !== 'name' && key !== 'terrain' && key !== 'objects')
    .map(([key, value]) => `,${eol}${indent}${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join('');
  // The terrain's settings (M5.3) on a line of their own, between the name and the objects.
  const terrain = space.terrain ? `${eol}${indent}"terrain": ${JSON.stringify(space.terrain)},` : '';
  const body = `{${eol}${indent}"name": ${JSON.stringify(space.name)},${terrain}${eol}${indent}"objects": ${objects}${others}${eol}}`;
  return `${layout.bom ? BOM : ''}${body}${layout.finalNewline ? eol : ''}`;
}

/** The text after `change`, in the layout it was in: the same text when the space is left as it was. */
export function changeSpaceText(text: string, change: (space: SpaceJson) => SpaceJson): string | null {
  const read = readSpace(text);
  if (!read.ok) return null;
  const next = change(read.space);
  if (JSON.stringify(next) === JSON.stringify(read.space)) return text;
  return spaceText(next, layoutOf(text));
}
