/**
 * @eb/schema: record types and the checks a project's records pass before the sim sees them
 * (docs/specs/records.md). Not pure, since it imports zod; the sim reads compiled records
 * through @eb/core's record store instead.
 *
 * Kits and games import zod from here, so every schema comes from the zod this package reads.
 */
export { z } from 'zod';
export {
  compareDiagnostics,
  DIAGNOSTIC_CODES,
  type Diagnostic,
  type DiagnosticCode,
  type Severity,
} from './diagnostics.ts';
export { recordJsonSchema } from './jsonSchema.ts';
export { defineRecordType, type RecordType, type RecordTypeDefinition, SchemaError } from './recordType.ts';
export { REF_KEY, type RefTarget, ref, refAny } from './refs.ts';
export { type RecordInput, type Usage, type Validation, validateRecords } from './validate.ts';
export { collectRefs, type FoundRef } from './walk.ts';
