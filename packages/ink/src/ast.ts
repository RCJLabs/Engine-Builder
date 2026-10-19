/**
 * A scene as the parser reads it (docs/specs/ink.md): its EXTERNALs, the tags at its top, and the
 * items of its top and of each knot, in the order written. Choices and gathers are flat here, with
 * their depth; weave.ts nests them.
 */
import type { Op } from '@eb/core';

/** A place in the scene: its line, counted from 1, and the column, from 1, where one is known. */
export interface At {
  readonly line: number;
  readonly column?: number;
}

/** An ink expression, as far as the subset goes: literals, EXTERNAL calls, comparisons, and, or, not. */
export type Expr =
  | { readonly kind: 'or' | 'and'; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'not'; readonly of: Expr }
  | { readonly kind: 'compare'; readonly op: Op; readonly left: Expr; readonly right: Expr; readonly column: number }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Expr[]; readonly column: number }
  | { readonly kind: 'literal'; readonly value: number | string | boolean; readonly column: number };

/** A condition and where it was written: its expression's columns count from its text's start, `offset` columns into the line. */
export interface Written {
  readonly expr: Expr;
  readonly at: At;
  readonly offset: number;
}

export type Tag =
  | { readonly kind: 'speaker'; readonly id: string; readonly at: At }
  | { readonly kind: 'fx'; readonly effect: Readonly<Record<string, unknown>>; readonly at: At }
  | { readonly kind: 'beat'; readonly at: At }
  | { readonly kind: 'cost'; readonly cost: Readonly<Record<string, number>>; readonly at: At }
  | { readonly kind: 'needs'; readonly needs: Written; readonly at: At }
  | { readonly kind: 'name'; readonly text: string; readonly at: At }
  | { readonly kind: 'show-odds'; readonly at: At };

/** Text, or `{cond: this|that}` inside it: what shows when it holds, and when it doesn't. */
export type Segment = string | { readonly cond: Written; readonly holds: string; readonly fails: string };

export interface CondBranch {
  readonly at: At;
  /** Left out for `else`. */
  readonly cond?: Written;
  readonly body: readonly Item[];
}

export type Item =
  | { readonly kind: 'para'; readonly at: At; readonly segments: readonly Segment[]; readonly tags: readonly Tag[] }
  | { readonly kind: 'tags'; readonly at: At; readonly tags: readonly Tag[] }
  | { readonly kind: 'divert'; readonly at: At; readonly target: string }
  | { readonly kind: 'cond'; readonly at: At; readonly branches: readonly CondBranch[] }
  | {
      readonly kind: 'choice';
      readonly at: At;
      readonly depth: number;
      readonly label?: string;
      readonly conds: readonly Written[];
      readonly text: string;
      readonly tags: readonly Tag[];
      readonly divert?: string;
    }
  | { readonly kind: 'gather'; readonly at: At; readonly depth: number; readonly label?: string };

export interface External {
  readonly name: string;
  readonly params: readonly string[];
  readonly at: At;
}

export interface Knot {
  readonly name: string;
  readonly at: At;
  readonly items: readonly Item[];
}

export interface Story {
  readonly externals: readonly External[];
  /** `# name:` and `# show-odds`, from the scene's top. */
  readonly globals: readonly Tag[];
  readonly root: readonly Item[];
  readonly knots: readonly Knot[];
}
