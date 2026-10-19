import {
  type CalendarDef,
  type EventCatalog,
  type FactCatalog,
  FLAG,
  type FlagRecord,
  formatRef,
  isRecordId,
  type RecordIndex,
  SHEET,
} from '@eb/core';
import type { z } from 'zod';
import { checkPart, type PartContext } from './checkValue.ts';
import { compareDiagnostics, compareText, type Diagnostic, type DiagnosticCode, severityOf } from './diagnostics.ts';
import { withEngineTypes } from './engineTypes.ts';
import { FlagChecks } from './flagCheck.ts';
import { KitChecks } from './kitCheck.ts';
import { kitDataTypes } from './kitTypes.ts';
import { knownFrom } from './known.ts';
import type { RecordType } from './recordType.ts';
import { checkSheet } from './sheetCheck.ts';

export interface RecordInput {
  readonly type: string;
  /** From the record's file name (M1.4); the record's JSON does not repeat it. */
  readonly id: string;
  readonly file?: string;
  readonly value: unknown;
  /**
   * The file could not be read, and the compiler has said why. The record still exists, so
   * references to it resolve, but its value is not checked.
   */
  readonly unreadable?: boolean;
}

/** One place that references a record. */
export interface Usage {
  /** The referencing record, as "type:id". */
  readonly from: string;
  readonly file?: string;
  readonly path: string;
}

export interface Validation {
  /** Sorted by compareDiagnostics. */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Every "type:id" that something references, sorted, with its usages sorted by from, path
   * and file. It includes references that fail E005 or E006, so the editor can show what still
   * points at a deleted record.
   */
  readonly usedBy: ReadonlyMap<string, readonly Usage[]>;
  /**
   * The same for assets (M2.7): every path inside assets/ an asset field holds, sorted, with the
   * records that hold it, files that aren't there included (E018).
   */
  readonly assetsUsedBy: ReadonlyMap<string, readonly Usage[]>;
}

export interface ValidateOptions {
  /**
   * The game's facts (factCatalog in @eb/core), to check conditions against (E012 to E014) and
   * lint them (W102 to W104). Without it, conditions are checked against the engine's own facts
   * (D36), and a fact those don't list is taken as written.
   */
  readonly facts?: FactCatalog;
  /** The game's events (eventCatalog in @eb/core), for rows' When (E022, E023). Without it, the engine's own, and any other taken as written. */
  readonly events?: EventCatalog;
  /** The game's effects' schemas, for effect fields (E001, E025). Without them, the engine's own, and any other kept as written. */
  readonly effects?: readonly z.core.$ZodType[];
  /** A project game's effects by name (M3.2): content may name no other; the game's own are kept as written. */
  readonly effectNames?: readonly string[];
  /**
   * The files under the project's assets/ folder, as paths inside it, for asset fields to name
   * (E018). Without it, asset fields get only the shape check.
   */
  readonly assets?: ReadonlySet<string>;
  /**
   * The kits on (M3.3, D41): their types join the engine's, unless one of `types` already has the
   * name (the compiler's, with a project's own fields), and their records get the kits' checks.
   */
  readonly kits?: readonly string[];
  /** project.json's calendar (M3.5, D43): the time kit's facts, events and effects follow it. */
  readonly calendar?: CalendarDef;
}

/**
 * Checks records against their types and against each other. The engine's own types (flag and
 * sheet) join the ones given. The result depends only on the set of records given, never on
 * their order.
 */
export function validateRecords(
  types: readonly RecordType[],
  records: readonly RecordInput[],
  options: ValidateOptions = {},
): Validation {
  const on = options.kits ?? [];
  const given = new Set(types.map((t) => t.type));
  const kitTypes = kitDataTypes(on)
    .filter((d) => !given.has(d.type))
    .map((d) => d.recordType);
  const byName = indexTypes(withEngineTypes([...kitTypes, ...types]));
  const known = knownFrom(options);
  // Records of unknown types count too; no reference can name them, since every reference
  // target is a known type.
  const counts = new Map<string, number>();
  for (const { type, id } of records) counts.set(formatRef(type, id), (counts.get(formatRef(type, id)) ?? 0) + 1);
  const index = recordIndex(records, counts);
  const diagnostics: Diagnostic[] = [];
  const usages = new Map<string, Usage[]>();
  const assetUsages = new Map<string, Usage[]>();
  const flags = new FlagChecks();
  const kits = new KitChecks(on, known);
  for (const record of records) {
    const from = formatRef(record.type, record.id);
    const report = (code: DiagnosticCode, path: string, message: string) =>
      diagnostics.push(diagnostic(record, code, path, message));
    const use = (key: string, path: string) => listUsage(usages, key, usage(record, path));
    const recordType = byName.get(record.type);
    if (!recordType) {
      report('E002', '', `Unknown record type "${record.type}"`);
      continue;
    }
    if (!isRecordId(record.id)) {
      report(
        'E003',
        '',
        `"${record.id}" is not a valid id: use lowercase words joined by hyphens, at most 64 characters`,
      );
    }
    const count = counts.get(from) ?? 0;
    if (count > 1) report('E004', '', `${count} ${record.type} records have the id "${record.id}"`);
    if (record.unreadable) continue;
    const ctx: PartContext = {
      known,
      records: index,
      report,
      use,
      asset: (path, value) => {
        listUsage(assetUsages, value, usage(record, path));
        if (options.assets && !options.assets.has(value)) report('E018', path, `No file assets/${value}`);
      },
      condition: (path, sound) => {
        flags.condition({ from, path, report }, sound, known.facts);
        kits.condition(report, sound);
      },
      effect: (path, value) => {
        flags.effect({ from, path, report }, value);
        for (const flag of kits.flagsReadBy(value)) flags.heard(flag, from);
        kits.effect(report, path, value);
      },
    };
    const sound = checkPart(recordType.schema, record.value, '', ctx);
    if (record.type === SHEET) {
      const heard = (type: string, id: string) => {
        if (type === FLAG) flags.heard(id, from);
      };
      checkSheet(record.value, { ...ctx, heard });
    }
    if (record.type === FLAG && sound) flags.declare(record.id, record.value as FlagRecord, report);
    if (sound) {
      kits.record(record.type, record.id, record.value, report);
      for (const flag of kits.flagsRead(record.type, record.value)) flags.heard(flag, from);
    }
  }
  flags.finish((flag) => usages.has(formatRef(FLAG, flag)));
  kits.finish();
  return {
    diagnostics: diagnostics.sort(compareDiagnostics),
    usedBy: sortUsages(usages),
    assetsUsedBy: sortUsages(assetUsages),
  };
}

function listUsage(map: Map<string, Usage[]>, key: string, entry: Usage): void {
  const list = map.get(key) ?? [];
  list.push(entry);
  map.set(key, list);
}

/**
 * The records by type, for conditions. Order doesn't matter: the lint only needs some id other
 * than those a condition names, and every such id behaves the same.
 */
function recordIndex(records: readonly RecordInput[], counts: ReadonlyMap<string, number>): RecordIndex {
  const ids = new Map<string, string[]>();
  for (const { type, id } of records) {
    const list = ids.get(type);
    if (list) list.push(id);
    else ids.set(type, [id]);
  }
  return { ids: (type) => ids.get(type) ?? [], has: (type, id) => counts.has(formatRef(type, id)) };
}

/** Throws on programmer errors: two types with one name, or a reference to a type nobody defined. */
function indexTypes(types: readonly RecordType[]): ReadonlyMap<string, RecordType> {
  const byName = new Map<string, RecordType>();
  for (const recordType of types) {
    if (byName.has(recordType.type)) throw new Error(`Two record types are named "${recordType.type}"`);
    byName.set(recordType.type, recordType);
  }
  for (const recordType of types) {
    for (const target of recordType.targets) {
      if (!byName.has(target)) throw new Error(`Record type "${recordType.type}" references unknown type "${target}"`);
    }
  }
  return byName;
}

function diagnostic(record: RecordInput, code: DiagnosticCode, path: string, message: string): Diagnostic {
  const { type, id, file } = record;
  return { code, severity: severityOf(code), message, type, id, ...(file === undefined ? {} : { file }), path };
}

function usage(record: RecordInput, path: string): Usage {
  const from = formatRef(record.type, record.id);
  return record.file === undefined ? { from, path } : { from, file: record.file, path };
}

function sortUsages(usages: ReadonlyMap<string, Usage[]>): ReadonlyMap<string, readonly Usage[]> {
  const byUsage = (a: Usage, b: Usage) =>
    compareText(a.from, b.from) || compareText(a.path, b.path) || compareText(a.file ?? '', b.file ?? '');
  const keys = [...usages.keys()].sort(compareText);
  return new Map(keys.map((key) => [key, Object.freeze([...(usages.get(key) ?? [])].sort(byUsage))]));
}
