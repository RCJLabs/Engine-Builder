/**
 * A behaviour's tree as its outline shows and edits it (M6.3, D75, docs/specs/ai.md#the-editor): a
 * row a node, by steps from the record's `do`, and each edit a plain function of the tree that gives
 * a new one. Paths are the kit's (child indices joined by dots, "" for `do` itself); the tree is
 * read as the file holds it, so a node half made, or not a node at all, still has its row.
 */
import { childPath, kindOf, lastIndex, type NodeKind, parentOf } from '@eb/kits';
import type { Path } from '../forms/values.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The kinds that hold a list of nodes. */
export const LISTS: ReadonlySet<NodeKind> = new Set(['first', 'in-order']);
export type Wrap = 'first' | 'in-order' | 'guard';

export interface OutlineRow {
  readonly path: string;
  /** Where the node sits in the record, from the top: ['do', 'first', 0, …]. */
  readonly at: Path;
  readonly depth: number;
  readonly kind: NodeKind | undefined;
  readonly node: unknown;
  /** Its place among its parent's list, and how many are in it: 0 and 1 under a guard or at the top. */
  readonly index: number;
  readonly siblings: number;
  readonly inList: boolean;
}

/** A node's children as the file holds them: a list's, a guard's one, a leaf's none. */
export function kidsOf(node: unknown): readonly unknown[] {
  const kind = kindOf(node);
  if (!isObject(node)) return [];
  if (kind === 'first' || kind === 'in-order') return Array.isArray(node[kind]) ? (node[kind] as unknown[]) : [];
  return kind === 'guard' ? [node.do] : [];
}

/** Where a child sits below its parent: under the list's key, or a guard's do. */
const below = (parent: unknown, index: number): Path => {
  const kind = kindOf(parent);
  return kind === 'guard' ? ['do'] : [kind as string, index];
};

/** Every node, depth first, each with where it sits. */
export function rowsOf(root: unknown): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const walk = (
    node: unknown,
    path: string,
    at: Path,
    depth: number,
    index: number,
    siblings: number,
    inList: boolean,
  ) => {
    rows.push({ path, at, depth, kind: kindOf(node), node, index, siblings, inList });
    const kids = kidsOf(node);
    const list = LISTS.has(kindOf(node) as NodeKind);
    for (const [i, kid] of kids.entries())
      walk(kid, childPath(path, i), [...at, ...below(node, i)], depth + 1, i, kids.length, list);
  };
  walk(root, '', ['do'], 0, 0, 1, false);
  return rows;
}

/** Where the node at `path` sits in the record, or undefined when the tree has none there. */
export function atOf(root: unknown, path: string): Path | undefined {
  return rowsOf(root).find((row) => row.path === path)?.at;
}

/** The tree with the node at `path` made `change(node)`, copying only the nodes on its way. */
export function changeAt(root: unknown, path: string, change: (node: unknown) => unknown): unknown {
  if (path === '') return change(root);
  const [first, ...rest] = path.split('.');
  const index = Number(first);
  const kind = kindOf(root);
  const kid = kidsOf(root)[index];
  if (kid === undefined || !isObject(root)) return root;
  const next = changeAt(kid, rest.join('.'), change);
  if (kind === 'guard') return { ...root, do: next };
  const list = [...kidsOf(root)];
  list[index] = next;
  return { ...root, [kind as string]: list };
}

/** The list node at `parent` with `make(list)` for its list. */
const listAt = (root: unknown, parent: string, make: (list: unknown[]) => unknown[]) =>
  changeAt(root, parent, (node) => {
    const kind = kindOf(node);
    return LISTS.has(kind as NodeKind) && isObject(node)
      ? { ...node, [kind as string]: make([...kidsOf(node)]) }
      : node;
  });

/** A new node last in the list node at `path`; the new node's path. */
export function addInside(root: unknown, path: string, node: unknown): { root: unknown; path: string } {
  const count = kidsOf(atNode(root, path)).length;
  return { root: listAt(root, path, (list) => [...list, node]), path: childPath(path, count) };
}

/** A new node after the one at `path` in its parent's list; the new node's path. */
export function addAfter(root: unknown, path: string, node: unknown): { root: unknown; path: string } {
  const parent = parentOf(path);
  if (parent === undefined) return { root, path };
  const i = lastIndex(path);
  return {
    root: listAt(root, parent, (list) => [...list.slice(0, i + 1), node, ...list.slice(i + 1)]),
    path: childPath(parent, i + 1),
  };
}

/** The node at `path`, or undefined. */
export function atNode(root: unknown, path: string): unknown {
  if (path === '') return root;
  let node: unknown = root;
  for (const part of path.split('.')) node = kidsOf(node)[Number(part)];
  return node;
}

/** Whether the node at `path` can be taken out: one of a list of more than one. */
export function canRemove(root: unknown, path: string): boolean {
  const parent = parentOf(path);
  return (
    parent !== undefined &&
    LISTS.has(kindOf(atNode(root, parent)) as NodeKind) &&
    kidsOf(atNode(root, parent)).length > 1
  );
}

/** The tree without the node at `path`, and the path to show after: the one before it, or its parent. */
export function removeAt(root: unknown, path: string): { root: unknown; path: string } {
  const parent = parentOf(path);
  if (parent === undefined || !canRemove(root, path)) return { root, path };
  const i = lastIndex(path);
  return {
    root: listAt(root, parent, (list) => list.filter((_, k) => k !== i)),
    path: i > 0 ? childPath(parent, i - 1) : parent,
  };
}

/** The tree with the node at `path` moved `by` places in its list, and its new path. */
export function moveAt(root: unknown, path: string, by: -1 | 1): { root: unknown; path: string } {
  const parent = parentOf(path);
  if (parent === undefined) return { root, path };
  const i = lastIndex(path);
  const j = i + by;
  if (j < 0 || j >= kidsOf(atNode(root, parent)).length || !LISTS.has(kindOf(atNode(root, parent)) as NodeKind))
    return { root, path };
  const moved = listAt(root, parent, (list) => {
    const [taken] = list.splice(i, 1);
    list.splice(j, 0, taken);
    return list;
  });
  return { root: moved, path: childPath(parent, j) };
}

/** The node at `path` put inside a new first, in-order or guard, which takes its place. */
export const wrapAt = (root: unknown, path: string, as: Wrap): unknown =>
  changeAt(root, path, (node) => (as === 'guard' ? { do: node } : { [as]: [node] }));

/** Whether the node at `path` holds exactly one node, which could take its place. */
export const canUnwrap = (root: unknown, path: string): boolean => {
  const node = atNode(root, path);
  return kindOf(node) !== undefined && kidsOf(node).length === 1;
};

/** The node at `path` replaced by its one child. */
export const unwrapAt = (root: unknown, path: string): unknown =>
  canUnwrap(root, path) ? changeAt(root, path, (node) => kidsOf(node)[0]) : root;

/** What a new node starts with: the calendar's unit for its lengths, and a point of the actor's space. */
export interface Start {
  readonly unit: string;
  readonly point: string;
}

/** The unit a new length is in: minutes when the calendar has them, else its first unit past ticks and days. */
export function startUnit(units: readonly string[]): string {
  if (units.includes('minutes')) return 'minutes';
  return units.find((u) => u !== 'ticks' && u !== 'days') ?? 'ticks';
}

/** A new node of a kind, to be filled in. */
export function newNode(kind: NodeKind, start: Start): unknown {
  const length = { [start.unit]: 10 };
  switch (kind) {
    case 'first':
    case 'in-order':
      return { [kind]: [{ wait: length }] };
    case 'guard':
      return { do: { wait: length } };
    case 'travel':
    case 'sleep':
    case 'work':
      return { [kind]: start.point };
    case 'patrol':
      return { patrol: [start.point] };
    case 'sandbox':
      return { sandbox: [start.point], dwell: length };
    case 'follow':
    case 'face':
      return { [kind]: 'player' };
    case 'wait':
      return { wait: length };
    case 'effects':
      return { effects: [] };
  }
}

const GOES: ReadonlySet<NodeKind> = new Set(['travel', 'sleep', 'work']);
const ROUNDS: ReadonlySet<NodeKind> = new Set(['patrol', 'sandbox']);

/** The points a node names: a travel's one, a patrol's list. */
function pointsIn(node: Record<string, unknown>, kind: NodeKind): unknown[] {
  const held = node[kind];
  if (GOES.has(kind) && typeof held === 'string') return [held];
  return ROUNDS.has(kind) && Array.isArray(held) ? held : [];
}

/** The node made another kind: a list keeps its nodes, and one that goes somewhere keeps its points. */
export function asKind(node: unknown, kind: NodeKind, start: Start): unknown {
  const from = kindOf(node);
  if (from === kind) return node;
  if (!isObject(node) || from === undefined) return newNode(kind, start);
  if (LISTS.has(from) && LISTS.has(kind)) return { [kind]: kidsOf(node) };
  const points = pointsIn(node, from);
  if (points.length === 0) return newNode(kind, start);
  if (GOES.has(kind)) return { [kind]: points[0] };
  if (!ROUNDS.has(kind)) return newNode(kind, start);
  const dwell = node.dwell ?? (kind === 'sandbox' ? { [start.unit]: 10 } : undefined);
  return { [kind]: points, ...(dwell !== undefined ? { dwell } : {}) };
}
