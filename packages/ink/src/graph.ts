/**
 * A scene's flow as lines to be (docs/specs/ink.md#how-a-scene-becomes-a-talk): text said by one
 * speaker, a point where the flow branches on conditions, or a point that offers choices; each
 * leading on to another, to a knot or label by name, or to the end. emit.ts names them and writes
 * the talk.
 */
import type { At, Segment, Written } from './ast.ts';

export type Ref =
  | { readonly kind: 'node'; readonly node: Node }
  | { readonly kind: 'end' }
  | { readonly kind: 'divert'; readonly target: string; readonly knot: string | undefined; readonly at: At };

export const END: Ref = { kind: 'end' };

export interface Para {
  readonly segments: readonly Segment[];
  readonly at: At;
}

export interface Fx {
  readonly effect: Readonly<Record<string, unknown>>;
  readonly at: At;
}

export interface Option {
  readonly at: At;
  readonly label?: string;
  readonly text: string;
  readonly conds: readonly Written[];
  readonly needs?: Written;
  readonly cost?: Readonly<Record<string, number>>;
  readonly effects: Fx[];
  to?: Ref;
}

export interface Branch {
  readonly cond: Written;
  to?: Ref;
}

/** A knot's or a label's name for a node, which other nodes divert to. */
export interface Name {
  readonly name: string;
  readonly at: At;
  readonly label: boolean;
}

export interface Node {
  /** Text, a branch point, or a choice point that has no text of its own. */
  readonly kind: 'text' | 'pass' | 'choices';
  readonly at: At;
  /** The knot it is in; undefined at the scene's top. */
  readonly knot: string | undefined;
  name?: Name;
  readonly speaker?: { readonly id: string; readonly at: At };
  readonly paras: Para[];
  readonly effects: Fx[];
  readonly options: Option[];
  readonly branches: Branch[];
  next?: Ref;
}

/** A loose end: something whose next isn't known yet, and where it was written. */
export interface End {
  set(ref: Ref): void;
  readonly at: At;
}

export interface Graph {
  readonly nodes: readonly Node[];
  readonly start: Ref | undefined;
}

/** Whether a node's text has `{cond: this|that}` inside it, and so is shown as one of its variants. */
export const hasInline = (node: Node): boolean =>
  node.paras.some((para) => para.segments.some((segment) => typeof segment !== 'string'));
