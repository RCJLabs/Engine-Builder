export { type CheckOptions, checkCondition } from './check.ts';
export { describeCondition, OP_WORDS } from './describe.ts';
export { compare, evaluate, type FactReader } from './evaluate.ts';
export { ConditionSyntaxError } from './lexer.ts';
export { logicModule, type RollEffect, type RollOutcome, type RollRow, rollTable } from './module.ts';
export { type ConditionRef, conditionRefs } from './refs.ts';
export { EXHAUSTIVE_LIMIT, SAMPLES, type Satisfiability, type SatOptions, satisfiability } from './sat.ts';
export { type ParseResult, parseCondition, printCondition, printValue } from './text.ts';
export {
  type Condition,
  type ConditionIssue,
  type Domain,
  type FactCatalog,
  type FactInfo,
  type FactTest,
  OPS,
  type Op,
  type Truth,
  type Value,
} from './types.ts';
export {
  domainError,
  domainProblem,
  FACT_PATTERN,
  isPrintableNumber,
  isValue,
  NAME_PATTERN,
  type RecordIndex,
  valueProblem,
} from './values.ts';
