import { pointerSegment } from '../canonical.ts';
import { type ConditionIssue, type FactCatalog, type FactTest, OPS, type Value } from './types.ts';
import {
  domainProblem,
  FACT_PATTERN,
  isOrdering,
  isValue,
  NAME_PATTERN,
  type RecordIndex,
  valueProblem,
} from './values.ts';

export interface CheckOptions {
  /** The game's facts. Without it, only the shape is checked. */
  readonly catalog?: FactCatalog;
  /** The records, to check that referenced records exist. */
  readonly records?: RecordIndex;
  /**
   * The catalog isn't every fact there is: it is the engine's own, and a game's facts are taken as
   * written (D36). Without it, a fact the catalog doesn't list is E012.
   */
  readonly open?: boolean;
}

type Report = (code: ConditionIssue['code'], path: string, message: string) => void;

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Everything wrong with a condition, each at a JSON Pointer inside it. Empty when it is sound. */
export function checkCondition(condition: unknown, options: CheckOptions = {}): ConditionIssue[] {
  const issues: ConditionIssue[] = [];
  walk(condition, '', options, (code, path, message) => issues.push({ code, path, message }));
  return issues;
}

function walk(node: unknown, path: string, options: CheckOptions, report: Report): void {
  if (!isObject(node)) {
    report('E011', path, 'A condition is an object with all, any, not or fact');
    return;
  }
  const kinds = ['all', 'any', 'not', 'fact'].filter((key) => key in node);
  const kind = kinds[0];
  if (kind === undefined || kinds.length > 1) {
    report(
      'E011',
      path,
      kinds.length === 0 ? 'A condition needs all, any, not or fact' : `Use one of ${kinds.join(', ')}`,
    );
  } else if (kind === 'fact') {
    checkTest(node, path, options, report);
  } else {
    unknownKeys(node, [kind], path, report);
    if (kind === 'not') walk(node.not, `${path}/not`, options, report);
    else walkList(node[kind], `${path}/${kind}`, options, report);
  }
}

function walkList(list: unknown, path: string, options: CheckOptions, report: Report): void {
  if (!Array.isArray(list) || list.length < 2) {
    report('E011', path, `${path.slice(path.lastIndexOf('/') + 1)} takes a list of two or more conditions`);
    return;
  }
  for (const [i, child] of list.entries()) walk(child, `${path}/${i}`, options, report);
}

function checkTest(node: Readonly<Record<string, unknown>>, path: string, options: CheckOptions, report: Report): void {
  let sound = unknownKeys(node, ['fact', 'args', 'op', 'value'], path, report);
  const { fact, args, op, value } = node;
  const fail = (at: string, message: string) => {
    report('E011', at, message);
    sound = false;
  };
  if (typeof fact !== 'string' || !FACT_PATTERN.test(fact))
    fail(`${path}/fact`, 'A fact is "module.name", like "hold.count"');
  if (args !== undefined) {
    if (!isObject(args) || Object.keys(args).length === 0)
      fail(`${path}/args`, 'args holds argument values; leave it out when there are none');
    else {
      for (const [name, arg] of Object.entries(args)) {
        if (!NAME_PATTERN.test(name) || !isValue(arg))
          fail(`${path}/args/${pointerSegment(name)}`, 'An argument is name: number, text or true/false');
      }
    }
  }
  if (op !== undefined && !(OPS as readonly unknown[]).includes(op))
    fail(`${path}/op`, `op is one of ${OPS.join(' ')}`);
  if ((op === undefined) !== (value === undefined))
    fail(path, 'op and value go together: both, or neither for a yes/no fact');
  if (value !== undefined && !isValue(value))
    fail(`${path}/value`, 'A value is a number (no exponent), text or true/false');
  if (sound && options.catalog) checkFact(node as unknown as FactTest, path, options, report);
}

function checkFact(test: FactTest, path: string, options: CheckOptions, report: Report): void {
  const info = options.catalog?.[test.fact];
  if (!info) {
    if (!options.open) report('E012', `${path}/fact`, `No fact "${test.fact}"`);
    return;
  }
  const declared = info.args ?? {};
  const given = test.args ?? {};
  for (const name of Object.keys(declared)) {
    if (!(name in given)) report('E013', path, `"${test.fact}" needs the argument "${name}"`);
  }
  for (const [name, arg] of Object.entries(given)) {
    const domain = declared[name];
    const problem = domain ? domainProblem(arg, domain, options.records) : `"${test.fact}" has no argument "${name}"`;
    if (problem) report('E013', `${path}/args/${pointerSegment(name)}`, problem);
  }
  const domain = info.domain;
  if (!domain) return;
  if (test.op === undefined) {
    if (domain.type !== 'bool')
      report('E014', path, `"${test.fact}" is not a yes/no fact: compare it, like "${test.fact} == …"`);
  } else if (isOrdering(test.op) && domain.type !== 'int' && domain.type !== 'number') {
    report('E014', `${path}/op`, `${test.op} compares numbers, and "${test.fact}" is not a number`);
  } else {
    const problem = valueProblem(test.value as Value, domain, options.records);
    if (problem) report('E014', `${path}/value`, problem);
  }
}

function unknownKeys(
  node: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
  report: Report,
): boolean {
  let sound = true;
  for (const key of Object.keys(node)) {
    if (!allowed.includes(key)) {
      report('E011', `${path}/${pointerSegment(key)}`, `Unknown field "${key}"`);
      sound = false;
    }
  }
  return sound;
}
