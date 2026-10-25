/**
 * A behaviour's nodes (docs/specs/ai.md#behaviours) read as the compiler has checked them: what
 * kind each is, its children, and the paths that name them, child indices joined by dots from the
 * record's `do`, "" for `do` itself.
 */
import type { BehaviourNode, GuardNode, Leaf } from './types.ts';

export type NodeKind = 'first' | 'in-order' | 'guard' | Leaf;

const KEYS: readonly [string, NodeKind][] = [
  ['first', 'first'],
  ['in-order', 'in-order'],
  ['do', 'guard'],
  ['travel', 'travel'],
  ['sleep', 'sleep'],
  ['work', 'work'],
  ['patrol', 'patrol'],
  ['sandbox', 'sandbox'],
  ['follow', 'follow'],
  ['wait', 'wait'],
  ['face', 'face'],
  ['effects', 'effects'],
];

/** The node's kind, by the key that names it; undefined for what isn't a node. */
export function kindOf(node: unknown): NodeKind | undefined {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined;
  return KEYS.find(([key]) => Object.hasOwn(node, key))?.[1];
}

/** Its children, in order: a guard's one, a leaf's none. */
export function childrenOf(node: BehaviourNode): readonly BehaviourNode[] {
  const kind = kindOf(node);
  if (kind === 'first') return (node as { first: readonly BehaviourNode[] }).first;
  if (kind === 'in-order') return (node as { 'in-order': readonly BehaviourNode[] })['in-order'];
  if (kind === 'guard') return [(node as GuardNode).do];
  return [];
}

export const childPath = (path: string, index: number): string => (path === '' ? `${index}` : `${path}.${index}`);

/** The node at a path, or undefined when the tree has none there. */
export function nodeAt(root: BehaviourNode, path: string): BehaviourNode | undefined {
  if (path === '') return root;
  let node: BehaviourNode | undefined = root;
  for (const part of path.split('.')) {
    if (node === undefined) return undefined;
    node = childrenOf(node)[Number(part)];
  }
  return node;
}

/** The paths from the root down to `path`, the root first and `path` last. */
export function pathsTo(path: string): string[] {
  if (path === '') return [''];
  const parts = path.split('.');
  return ['', ...parts.map((_, i) => parts.slice(0, i + 1).join('.'))];
}

/** The path's parent's, or undefined for the root's. */
export const parentOf = (path: string): string | undefined =>
  path === '' ? undefined : path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '';

/** The child index a path ends in. */
export const lastIndex = (path: string): number => Number(path.slice(path.lastIndexOf('.') + 1));
