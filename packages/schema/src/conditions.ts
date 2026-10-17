import {
  type Condition,
  checkCondition,
  conditionRefs,
  type FactCatalog,
  formatRef,
  type RecordIndex,
  SAMPLES,
  satisfiability,
} from '@eb/core';
import type { DiagnosticCode } from './diagnostics.ts';
import type { FoundCondition } from './walk.ts';

export interface ConditionContext {
  readonly facts: FactCatalog | undefined;
  readonly records: RecordIndex;
  report(code: DiagnosticCode, path: string, message: string): void;
  /** Records that the condition at `path` names "type:id". */
  use(key: string, path: string): void;
}

/**
 * Checks one condition field: its shape, then its facts, arguments and values against the
 * catalog (E011 to E014), then, once it is sound, whether it can be true and false at all
 * (W102 to W104). Without a catalog, every fact is one with no domain.
 */
export function checkConditionField(found: FoundCondition, ctx: ConditionContext): void {
  const issues = checkCondition(found.value, { ...(ctx.facts ? { catalog: ctx.facts } : {}), records: ctx.records });
  for (const issue of issues) ctx.report(issue.code, `${found.path}${issue.path}`, issue.message);
  if (issues.some((issue) => issue.code === 'E011')) return;
  const condition = found.value as Condition;
  for (const ref of conditionRefs(condition, ctx.facts ?? {}))
    ctx.use(formatRef(ref.type, ref.id), `${found.path}${ref.path}`);
  if (issues.length > 0) return;
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
}
