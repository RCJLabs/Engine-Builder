import {
  type Condition,
  checkCondition,
  conditionRefs,
  type FactCatalog,
  formatRef,
  parseCondition,
  type RecordIndex,
  SAMPLES,
  satisfiability,
} from '@eb/core';
import type { DiagnosticCode } from './diagnostics.ts';
import type { FoundCondition } from './walk.ts';

export interface ConditionContext {
  readonly facts: FactCatalog | undefined;
  /** The facts are the engine's own, and a fact they don't list is taken as written (D36). */
  readonly open?: boolean;
  readonly records: RecordIndex;
  report(code: DiagnosticCode, path: string, message: string): void;
  /** Records that the condition at `path` names "type:id". */
  use(key: string, path: string): void;
}

/** A condition whose shape is sound, and where each place inside it is in its record. */
export interface SoundCondition {
  readonly tree: Condition;
  /** Text has no places inside it to point at, so a place inside text is the field itself. */
  readonly at: (inner: string) => string;
}

/**
 * Checks one condition field: its text parses (E011), then its shape, then its facts, arguments
 * and values against the catalog (E011 to E014), then, once it is sound, whether it can be true
 * and false at all (W102 to W104). Without a catalog, every fact is one with no domain. Returns
 * the tree when its shape is sound, for the flag checks.
 */
export function checkConditionField(found: FoundCondition, ctx: ConditionContext): SoundCondition | undefined {
  const tree = readField(found, ctx);
  if (tree === undefined) return undefined;
  const at = typeof found.value === 'string' ? () => found.path : (inner: string) => `${found.path}${inner}`;
  const options = { ...(ctx.facts ? { catalog: ctx.facts } : {}), records: ctx.records, open: ctx.open === true };
  const issues = checkCondition(tree, options);
  for (const issue of issues) ctx.report(issue.code, at(issue.path), issue.message);
  if (issues.some((issue) => issue.code === 'E011')) return undefined;
  const condition = tree as Condition;
  for (const ref of conditionRefs(condition, ctx.facts ?? {})) ctx.use(formatRef(ref.type, ref.id), at(ref.path));
  if (issues.length > 0) return { tree: condition, at };
  const reach = satisfiability(condition, { ...(ctx.facts ? { catalog: ctx.facts } : {}), records: ctx.records });
  if (reach.canBeTrue === false) {
    ctx.report('W102', found.path, 'This condition is never true, whatever its facts hold');
  } else if (reach.canBeFalse === false) {
    ctx.report('W103', found.path, 'This condition is never false: it holds whenever its facts have values');
  } else if (reach.canBeTrue === null) {
    ctx.report(
      'W104',
      found.path,
      `Could not tell whether this condition can be true: none of ${SAMPLES} samples of its ${reach.combinations} combinations was`,
    );
  }
  return { tree: condition, at };
}

/** The field's tree: as written, or parsed from its text. Text that doesn't parse is E011, and there is no tree. */
function readField(found: FoundCondition, ctx: ConditionContext): unknown {
  if (typeof found.value !== 'string') return found.value;
  const parsed = parseCondition(found.value, ctx.facts);
  if (parsed.ok) return parsed.condition;
  ctx.report('E011', found.path, parsed.message);
  return undefined;
}
