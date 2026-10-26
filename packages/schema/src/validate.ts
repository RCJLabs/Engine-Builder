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
import { ACTOR, AI, BEHAVIOUR, FIGHTING, ITEM, QUEST, QUESTS, type QuestRecord } from '@eb/kits';
import type { z } from 'zod';
import { type Checked, checkBehaviours } from './aiCheck.ts';
import {
  ANIM_FACTS,
  ANIMATOR,
  type AnimatorRecord,
  checkActorAnimator,
  checkAnimator,
  checkAnimatorClips,
  type RiggedModel,
} from './animatorTypes.ts';
import { checkPart, type PartContext } from './checkValue.ts';
import { compareDiagnostics, compareText, type Diagnostic, type DiagnosticCode, severityOf } from './diagnostics.ts';
import { withEngineTypes } from './engineTypes.ts';
import { checkEnvironment, ENVIRONMENT, type EnvironmentRecord } from './environmentTypes.ts';
import { checkWeapon } from './fightingTypes.ts';
import { FlagChecks, type FlagUses, type HeldElsewhere } from './flagCheck.ts';
import { checkFoliage, FOLIAGE, type FoliageRecord } from './foliageTypes.ts';
import { KitChecks } from './kitCheck.ts';
import { kitDataTypes } from './kitTypes.ts';
import { knownFrom } from './known.ts';
import { checkModel, MODEL, type ModelRecord } from './modelTypes.ts';
import { checkCounts } from './questCheck.ts';
import type { RecordType } from './recordType.ts';
import { checkSheet } from './sheetCheck.ts';
import { checkEnterSpace, checkWalkTo, type SpaceSpawns, type Walkers } from './worldCheck.ts';

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
  /**
   * The project's spaces and each one's spawn points (M5.9), for enter-space's names (E076).
   * Without it, enter-space gets only the shape check.
   */
  readonly spaces?: SpaceSpawns;
  /** Where each placed actor stands (M6.2), for walk-to's names (E079). Without it, walk-to gets only the shape check. */
  readonly walkers?: Walkers;
  /** Flags set and read by spaces' trigger zones and by screens (M5.8), for the flags' lint. */
  readonly flagsElsewhere?: FlagUses;
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
  const kits = new KitChecks(on, known, index);
  // The ai kit's records, whose checks read every actor's and every behaviour's (M6.3).
  const behaving: Checked[] = [];
  const riggedOf = riggedModels(records);
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
        if (options.spaces) checkEnterSpace(value, options.spaces, report, path);
        if (options.walkers) checkWalkTo(value, options.walkers, report, path);
      },
    };
    const slotsAt = kits.slotsOf(record.type, record.value);
    if (slotsAt) ctx.slotsAt = slotsAt;
    // An animator's conditions read the stage's anim.* facts, not the game's (M6.5).
    const facts = record.type === ANIMATOR ? { ...ctx, known: { ...known, facts: ANIM_FACTS, openFacts: false } } : ctx;
    const sound = checkPart(recordType.schema, record.value, '', facts);
    const heard = (type: string, id: string) => {
      if (type === FLAG) flags.heard(id, from);
    };
    if (record.type === SHEET) checkSheet(record.value, { ...ctx, heard });
    if (sound && record.type === QUEST && on.includes(QUESTS))
      checkCounts(record.value as QuestRecord, { ...ctx, heard }, slotsAt);
    if (record.type === FLAG && sound) flags.declare(record.id, record.value as FlagRecord, report);
    if (record.type === ENVIRONMENT && sound) checkEnvironment(record.value as EnvironmentRecord, report);
    if (record.type === MODEL && sound) checkModel(record.value as ModelRecord, report);
    if (record.type === FOLIAGE && sound) checkFoliage(record.value as FoliageRecord, report);
    if (record.type === ANIMATOR && sound) {
      checkAnimator(record.value as AnimatorRecord, report);
      checkAnimatorClips(record.value as AnimatorRecord, riggedOf, report);
    }
    if (record.type === ACTOR && sound) checkActorAnimator(record.value as Record<string, unknown>, riggedOf, report);
    if (sound && on.includes(AI) && (record.type === BEHAVIOUR || record.type === ACTOR || record.type === ITEM))
      behaving.push({ type: record.type, id: record.id, value: record.value, report });
    if (sound && record.type === ITEM && on.includes(FIGHTING)) checkWeapon(record.value, report);
    if (sound) {
      kits.record(record.type, record.id, record.value, report);
      for (const flag of kits.flagsRead(record.type, record.value)) flags.heard(flag, from);
    }
  }
  if (on.includes(AI)) checkBehaviours(behaving, options.calendar, options.walkers, on.includes(FIGHTING));
  if (options.flagsElsewhere) flags.elsewhere(options.flagsElsewhere);
  heldBy(kits, options.flagsElsewhere?.held, diagnostics);
  flags.finish((flag) => usages.has(formatRef(FLAG, flag)));
  kits.finish();
  return {
    diagnostics: diagnostics.sort(compareDiagnostics),
    usedBy: sortUsages(usages),
    assetsUsedBy: sortUsages(assetUsages),
  };
}

/** What the zones and interacts hold (M5.9), heard by the kits' checks before they finish, each at its file. */
function heldBy(kits: KitChecks, held: HeldElsewhere | undefined, diagnostics: Diagnostic[]): void {
  const at =
    (file: string) =>
    (code: DiagnosticCode, path: string, message: string): void =>
      void diagnostics.push({ code, severity: severityOf(code), message, file, path });
  for (const { file, path, effect } of held?.effects ?? []) kits.effect(at(file), path, effect);
  for (const { file, sound } of held?.conditions ?? []) kits.condition(at(file), sound);
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

/** Each model record's rig and clips, by its id, for an animator's clips (E083) and an actor's animator (E085). */
function riggedModels(records: readonly RecordInput[]): (id: string) => RiggedModel | undefined {
  const models = new Map<string, RiggedModel>();
  for (const { type, id, value } of records) {
    if (type !== MODEL || typeof value !== 'object' || value === null) continue;
    const { rig, clips } = value as { rig?: unknown; clips?: unknown };
    const names = Array.isArray(clips)
      ? clips
          .map((clip) => (clip as { name?: unknown }).name)
          .filter((name): name is string => typeof name === 'string')
      : [];
    models.set(id, { rigged: typeof rig === 'object' && rig !== null, clips: names });
  }
  return (id) => models.get(id);
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
