/**
 * ink conditions as the engine's (docs/specs/ink.md#conditions). An EXTERNAL names a fact of the
 * game, its dot and hyphens written as underscores, `EXTERNAL flags_value(flag)` for flags.value,
 * so a scene stays ink that Inky opens; its arguments are the fact's, in the order the EXTERNAL
 * gives them. A fact said alone holds when it is true, or, for a number, not 0, as in ink.
 */
import type { Condition, FactCatalog, FactTest, Value } from '@eb/core';
import type { Expr, External, Written } from './ast.ts';
import { InkError, type Problems } from './problems.ts';

/** A fact as an EXTERNAL binds it: its id and its arguments' names, in the EXTERNAL's order. */
export interface Bound {
  readonly fact: string;
  readonly args: readonly string[];
}

/** A fact's or an argument's name as ink writes it. */
export const inkName = (name: string): string => name.replace(/[.-]/g, '_');

export function bindExternals(
  externals: readonly External[],
  catalog: FactCatalog,
  problems: Problems,
): Map<string, Bound> {
  const facts = new Map<string, string[]>();
  for (const fact of Object.keys(catalog).sort()) facts.set(inkName(fact), [...(facts.get(inkName(fact)) ?? []), fact]);
  const bound = new Map<string, Bound>();
  for (const external of externals) {
    if (bound.has(external.name)) {
      problems.add(external.at, `EXTERNAL ${external.name} is declared twice`);
      continue;
    }
    const named = facts.get(external.name) ?? [];
    if (named.length === 0) {
      const message = `EXTERNAL ${external.name} names no fact of the game: an EXTERNAL is a fact’s name with _ for its . and -, like flags_value for flags.value`;
      problems.add(external.at, message, 'E012');
    } else if (named.length > 1) {
      problems.add(external.at, `EXTERNAL ${external.name} could be ${named.join(' or ')}`);
    } else {
      const fact = named[0] as string;
      const args = problems.catching(external.at.line, () => bindArgs(fact, external.params, catalog));
      if (args) bound.set(external.name, { fact, args });
    }
  }
  return bound;
}

function bindArgs(fact: string, params: readonly string[], catalog: FactCatalog): string[] {
  const names = Object.keys(catalog[fact]?.args ?? {});
  const byInk = new Map(names.map((name) => [inkName(name), name]));
  const takes = names.length === 0 ? 'takes no arguments' : `takes ${names.map(inkName).join(', ')}`;
  const args = params.map((param) => {
    const name = byInk.get(param);
    if (name === undefined) throw new InkError(`${fact} has no argument ${param}: it ${takes}`, undefined, 'E013');
    return name;
  });
  if (new Set(args).size !== args.length)
    throw new InkError(`An argument of ${fact} is named twice`, undefined, 'E013');
  if (args.length !== names.length)
    throw new InkError(`${fact} ${takes}: name each in the EXTERNAL`, undefined, 'E013');
  return args;
}

/** The engine's condition for an ink condition; an InkError at a column of its text when it has none. */
export function toCondition(written: Written, bound: ReadonlyMap<string, Bound>, catalog: FactCatalog): Condition {
  const convert = (expr: Expr): Condition => {
    switch (expr.kind) {
      case 'or':
      case 'and': {
        const key = expr.kind === 'or' ? 'any' : 'all';
        const parts = [expr.left, expr.right].flatMap((side) => {
          const part = convert(side);
          return key in part ? (part as Record<typeof key, Condition[]>)[key] : [part];
        });
        return (key === 'any' ? { any: parts } : { all: parts }) as Condition;
      }
      case 'not':
        return { not: convert(expr.of) };
      case 'compare':
        return compared(expr, bound);
      case 'call': {
        const test = called(expr, bound);
        const domain = catalog[test.fact]?.domain?.type;
        if (domain === 'bool') return test;
        if (domain === 'int' || domain === 'number') return { ...test, op: '!=', value: 0 };
        throw new InkError(`Compare ${test.fact} with a value: it isn’t true or false`, expr.column);
      }
      case 'literal':
        throw new InkError('A value alone is always true or always false: compare a fact with it', expr.column);
    }
  };
  return convert(written.expr);
}

const FLIPPED = { '==': '==', '!=': '!=', '<': '>', '<=': '>=', '>': '<', '>=': '<=' } as const;

function compared(expr: Extract<Expr, { kind: 'compare' }>, bound: ReadonlyMap<string, Bound>): FactTest {
  const { left, right } = expr;
  if (left.kind === 'call' && right.kind === 'literal')
    return { ...called(left, bound), op: expr.op, value: right.value };
  if (left.kind === 'literal' && right.kind === 'call') {
    return { ...called(right, bound), op: FLIPPED[expr.op], value: left.value };
  }
  if (left.kind === 'call' && right.kind === 'call') {
    throw new InkError('Compare a fact with a value, not with another fact', expr.column);
  }
  if (left.kind === 'not' || right.kind === 'not') {
    throw new InkError('"not" goes before the whole comparison: not (fact == value)', expr.column);
  }
  throw new InkError('Compare a fact with a value', expr.column);
}

function called(expr: Extract<Expr, { kind: 'call' }>, bound: ReadonlyMap<string, Bound>): FactTest {
  const fact = bound.get(expr.name);
  if (fact === undefined) {
    throw new InkError(
      `${expr.name} isn’t an EXTERNAL of this scene: declare it at the top, EXTERNAL ${expr.name}(…)`,
      expr.column,
    );
  }
  if (expr.args.length !== fact.args.length) {
    throw new InkError(
      `${expr.name} takes ${fact.args.length} argument${fact.args.length === 1 ? '' : 's'}`,
      expr.column,
    );
  }
  const args: Record<string, Value> = {};
  expr.args.forEach((arg, index) => {
    if (arg.kind !== 'literal')
      throw new InkError('An argument is a value: a word in quotes, a number, true or false', expr.column);
    args[fact.args[index] as string] = arg.value;
  });
  return expr.args.length === 0 ? { fact: fact.fact } : { fact: fact.fact, args };
}
