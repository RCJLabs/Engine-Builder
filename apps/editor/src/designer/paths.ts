/**
 * Where things sit in a screen file (M4.5): JSON Pointers, as the checks' diagnostics give paths,
 * turned into the paths forms write to, and the key order each object of a screen is written in.
 */
import { pointerSegment } from '@eb/core';
import { getIn, type Path, setInOrder } from '../forms/values.ts';
import { ACTION_KEYS, AT_KEYS, LAYOUT_FIELDS, SCREEN_KEYS, TAB_KEYS, widgetKeys } from './widgets.ts';

export const pointer = (path: Path): string => path.map((key) => `/${pointerSegment(key)}`).join('');

const unescaped = (segment: string) => segment.replaceAll('~1', '/').replaceAll('~0', '~');

/** The path a pointer names in `root`: a segment is an index where it steps into a list. */
export function pathOf(root: unknown, at: string): Path {
  if (at === '') return [];
  const path: (string | number)[] = [];
  let node = root;
  for (const raw of at.slice(1).split('/')) {
    const segment = unescaped(raw);
    const key = Array.isArray(node) && /^\d+$/.test(segment) ? Number(segment) : segment;
    path.push(key);
    node = getIn(node, [key]);
  }
  return path;
}

export const valueAt = (root: unknown, at: string): unknown => getIn(root, pathOf(root, at));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The keys of the object at `path`, in the order a screen file writes them. */
export function keysAt(root: unknown, path: Path): readonly string[] {
  if (path.length === 0) return SCREEN_KEYS;
  const last = path.at(-1);
  const parent = path.at(-2);
  if (last === 'at') return AT_KEYS;
  if (parent === 'at') return LAYOUT_FIELDS;
  if (last === 'action') return ACTION_KEYS;
  if (parent === 'tabs' && typeof last === 'number') return TAB_KEYS;
  const node = getIn(root, path);
  return isObject(node) && typeof node.widget === 'string' ? widgetKeys(node.widget) : [];
}

/** `root` with the value at `path` set, or removed when `next` is undefined, each new key in its place. */
export const setAt = (root: unknown, path: Path, next: unknown): unknown =>
  setInOrder(root, path, next, (at) => keysAt(root, at));

/** `root` with a widget's `at` for each breakpoint left out once it changes nothing, and `at` once it is empty. */
export function pruneAt(root: unknown, widget: Path): unknown {
  const at = getIn(root, [...widget, 'at']);
  if (!isObject(at)) return root;
  let next = root;
  for (const [breakpoint, layout] of Object.entries(at)) {
    if (isObject(layout) && Object.keys(layout).length === 0)
      next = setAt(next, [...widget, 'at', breakpoint], undefined);
  }
  const left = getIn(next, [...widget, 'at']);
  return isObject(left) && Object.keys(left).length === 0 ? setAt(next, [...widget, 'at'], undefined) : next;
}
