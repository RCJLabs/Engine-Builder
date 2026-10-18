/**
 * @eb/schema: record types and the checks a project's records pass before the sim sees them
 * (docs/specs/records.md). Not pure, since it imports zod; the sim reads compiled records
 * through @eb/core's record store instead.
 *
 * Kits and games import zod from here, so every schema comes from the zod this package reads.
 */
export { z } from 'zod';
export {
  ASSET_KEY,
  ASSET_KINDS,
  ASSET_PATH_PATTERN,
  ASSET_TYPES,
  type AssetKind,
  asset,
  assetKindOf,
  isAssetOf,
} from './assets.ts';
export { CONDITION_KEY, condition, isConditionSchema, valueSchema } from './condition.ts';
export {
  compareDiagnostics,
  compareText,
  DIAGNOSTIC_CODES,
  type Diagnostic,
  type DiagnosticCode,
  type Severity,
  severityOf,
} from './diagnostics.ts';
export {
  addToFlagEffect,
  EFFECT_KEY,
  type EffectCatalog,
  ENGINE_EFFECTS,
  effect,
  effectCatalog,
  effectMark,
  isEffectShape,
  rollEffect,
  setFlagEffect,
} from './effect.ts';
export {
  ENGINE_TYPES,
  FLAG_TYPE,
  FLAG_TYPE_FILE,
  isEngineType,
  SHEET_DATA,
  SHEET_TYPE,
  SHEET_TYPE_FILE,
  withEngineTypes,
} from './engineTypes.ts';
export { type SchemaIssue, schemaIssues } from './issues.ts';
export { recordJsonSchema, typeFileJsonSchema } from './jsonSchema.ts';
export { KitChecks } from './kitCheck.ts';
export { type EffectFile, effectSchema, KIT_EFFECT_FILES, kitEffectFiles, kitEffectSchemas } from './kitEffects.ts';
export {
  ITEM_TYPE_FILE,
  isKitType,
  joinKitType,
  kitClash,
  kitDataTypes,
  kitOf,
  kitTypeFiles,
  RESOURCE_TYPE_FILE,
  SHOP_TYPE_FILE,
} from './kitTypes.ts';
export { ENGINE_EVENTS, ENGINE_FACTS, type Known, type KnownOptions, knownFrom } from './known.ts';
export { packValue } from './packValue.ts';
export {
  checkProvenance,
  isDay,
  kindOfAsset,
  LICENCES,
  type Licence,
  licenceOf,
  licenceProblem,
  type Provenance,
  type ProvenanceCode,
  type ProvenanceIssue,
  type ProvenanceLog,
  provenanceLogSchema,
  provenanceSchema,
} from './provenance.ts';
export { defineRecordType, type RecordType, type RecordTypeDefinition, SchemaError } from './recordType.ts';
export { REF_KEY, type RefTarget, ref, refAny } from './refs.ts';
export { cancelTimerEffect, scheduleEffect, waitEffect } from './time.ts';
export {
  type EnumDef,
  eachValue,
  FIELD_KINDS,
  FIELD_NAME_PATTERN,
  type FieldDef,
  type FieldInfo,
  type FieldKind,
  type Fields,
  fieldNameProblem,
  type ReadTypeFile,
  type RefDef,
  readTypeFile,
  type TypeFile,
  typeFileSchema,
  typeRefs,
  type ValueDef,
} from './typeFile.ts';
export { COLOUR_PATTERN, type DataType, fieldShape, typeFromFile } from './typeSchema.ts';
export {
  type RecordInput,
  type Usage,
  type ValidateOptions,
  type Validation,
  validateRecords,
} from './validate.ts';
export {
  collectRefs,
  type Found,
  type FoundAsset,
  type FoundCondition,
  type FoundEffect,
  type FoundRef,
  scanRecord,
} from './walk.ts';
