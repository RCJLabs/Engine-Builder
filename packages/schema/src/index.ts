/**
 * @eb/schema: record types and the checks a project's records pass before the sim sees them
 * (docs/specs/records.md). Not pure, since it imports zod; the sim reads compiled records
 * through @eb/core's record store instead.
 *
 * Kits and games import zod from here, so every schema comes from the zod this package reads.
 */
export { z } from 'zod';
export { CONDITION_KEY, condition, isConditionSchema, rollEffect } from './condition.ts';
export {
  compareDiagnostics,
  compareText,
  DIAGNOSTIC_CODES,
  type Diagnostic,
  type DiagnosticCode,
  type Severity,
  severityOf,
} from './diagnostics.ts';
export { recordJsonSchema } from './jsonSchema.ts';
export { defineRecordType, type RecordType, type RecordTypeDefinition, SchemaError } from './recordType.ts';
export { REF_KEY, type RefTarget, ref, refAny } from './refs.ts';
export { cancelTimerEffect, scheduleEffect, waitEffect } from './time.ts';
export {
  type RecordInput,
  type SchemaIssue,
  schemaIssues,
  type Usage,
  type ValidateOptions,
  type Validation,
  validateRecords,
} from './validate.ts';
export { collectRefs, type Found, type FoundCondition, type FoundRef, scanRecord } from './walk.ts';
