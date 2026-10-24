/**
 * The checks of spaces and prefabs that need the project's types and records (M5.2, D64,
 * docs/specs/components.md): each component against its kind (E062, E063), each placed record
 * against the records there are and its overrides against its type (E064, E065), each prefab
 * override against the prefab's objects (E066, and E058 for a field it can't change), a space's
 * environment against the records (E069, M5.4), its terrain's foliage (E073, M5.6), and its starts
 * (W142). Every reference found is a use, for the editor's "used by".
 */
import { conditionRefs, FLAG, formatRef, parseRef, pointerSegment, type RecordIndex } from '@eb/core';
import {
  checkPart,
  type DataType,
  type Diagnostic,
  type DiagnosticCode,
  ENVIRONMENT,
  type FlagUses,
  FOLIAGE,
  type Known,
  type PartContext,
  type RecordType,
  schemaIssues,
  severityOf,
  z,
} from '@eb/schema';
import { type Fields, isFields, overridden, passedOn, recordHere } from './overrides.ts';
import { starts, waters } from './spaceLints.ts';
import { placeFields, type SpaceJson, type SpaceObject, spaceSchema } from './spaceShape.ts';
import { atLines, type SpaceFileRead } from './spaces.ts';

export interface SpacePartsContext {
  /** Every record type there is, by name. */
  readonly types: ReadonlyMap<string, RecordType>;
  readonly records: RecordIndex;
  /** A record's value, or undefined when there is none or it can't be read. */
  value(type: string, id: string): unknown;
  readonly known: Known;
  readonly kinds: ReadonlyMap<string, DataType>;
  /** Kinds whose files have problems: their components wait unchecked. */
  readonly uncheckedKinds: ReadonlySet<string>;
  /** The files under assets/, for an asset field's E018. Without it, unchecked. */
  readonly assets?: ReadonlySet<string>;
}

/** A reference a space or prefab holds: a placed record, or a ref inside a component or an override. */
export interface SpaceUse {
  readonly key: string;
  readonly file: string;
  /** The id of the file's object it is in: the placement, for a ref inside its overrides; '' for the space's own (its environment, its foliage). */
  readonly object: string;
  readonly path: string;
}

/** What an override can change; `overrides` only on what places something, shape and colour only on a shape. */
const overrideSchema = z.strictObject(placeFields);

const DEEPEST = 8;

interface Walk {
  readonly ctx: SpacePartsContext;
  readonly file: string;
  /** The file's object being checked. */
  readonly object: string;
  readonly prefabs: ReadonlyMap<string, SpaceJson>;
  readonly diagnostics: Diagnostic[];
  readonly uses: SpaceUse[];
  readonly flags: { readonly set: Map<string, Set<string>>; readonly read: Map<string, Set<string>> };
}

const listFlag = (flags: Map<string, Set<string>>, flag: string, file: string) =>
  flags.set(flag, (flags.get(flag) ?? new Set()).add(file));

export function checkSpaceParts(
  files: readonly SpaceFileRead[],
  ctx: SpacePartsContext,
): { diagnostics: Diagnostic[]; uses: SpaceUse[]; flags: FlagUses } {
  const sound = files.filter((f) => f.value !== undefined && schemaIssues(spaceSchema, f.value).length === 0);
  const prefabs = new Map(sound.filter((f) => f.kind === 'prefab').map((f) => [f.id, f.value as SpaceJson]));
  const diagnostics: Diagnostic[] = [];
  const uses: SpaceUse[] = [];
  const flags = { set: new Map<string, Set<string>>(), read: new Map<string, Set<string>>() };
  for (const read of sound) {
    const space = read.value as SpaceJson;
    const walk = (object: string): Walk => ({ ctx, file: read.file, object, prefabs, diagnostics, uses, flags });
    for (const [i, object] of space.objects.entries()) checkObject(walk(object.id), object, `/objects/${i}`);
    if (read.kind === 'space') {
      environmentOf(walk(''), space);
      foliageOf(walk(''), space);
      diagnostics.push(...starts(read.file, space, prefabs));
    }
    diagnostics.push(...waters(read.file, space, prefabs));
  }
  return { diagnostics, uses, flags };
}

/** The space's environment (M5.4): a use of its record, which is E069 when there is none. */
function environmentOf(walk: Walk, space: SpaceJson): void {
  const id = space.environment;
  if (id === undefined) return;
  walk.uses.push({ key: formatRef(ENVIRONMENT, id), file: walk.file, object: '', path: '/environment' });
  if (!walk.ctx.records.has(ENVIRONMENT, id)) report(walk, 'E069', '/environment', `No environment record "${id}"`);
}

/** The terrain's foliage (M5.6): each a use of its record, which is E073 when there is none. */
function foliageOf(walk: Walk, space: SpaceJson): void {
  for (const [k, id] of (space.terrain?.foliage ?? []).entries()) {
    const path = `/terrain/foliage/${k}`;
    walk.uses.push({ key: formatRef(FOLIAGE, id), file: walk.file, object: '', path });
    if (!walk.ctx.records.has(FOLIAGE, id)) report(walk, 'E073', path, `No foliage record "${id}"`);
  }
}

const report = (walk: Walk, code: DiagnosticCode, path: string, message: string) =>
  walk.diagnostics.push({ code, severity: severityOf(code), message, file: walk.file, path });

function checkObject(walk: Walk, object: SpaceObject, at: string): void {
  for (const [kind, fields] of Object.entries(object.components ?? {})) {
    checkComponent(walk, kind, fields, `${at}/components/${kind}`);
  }
  if (object.record !== undefined) {
    const key = parseRef(object.record);
    if (!key || !walk.ctx.types.has(key.type)) {
      report(walk, 'E064', `${at}/record`, `No record type "${key?.type ?? object.record}" in this project`);
      return;
    }
    walk.uses.push({ key: object.record, file: walk.file, object: walk.object, path: `${at}/record` });
    if (!walk.ctx.records.has(key.type, key.id)) {
      report(walk, 'E064', `${at}/record`, `No record ${object.record}`);
      return;
    }
    if (object.overrides) checkRecordOverrides(walk, object.record, [], object.overrides, `${at}/overrides`);
  }
  if (object.prefab !== undefined && object.overrides) {
    checkPrefabOverrides(walk, object.prefab, [], object.overrides, `${at}/overrides`, 0);
  }
}

/**
 * A component's fields against its kind. `only`, when given, is the fields an override sets: the
 * rest are the prefab's, checked there, so only problems in these (or in the whole) are reported.
 */
function checkComponent(walk: Walk, kind: string, fields: unknown, at: string, only?: ReadonlySet<string>): void {
  const type = walk.ctx.kinds.get(kind);
  if (!type) {
    if (!walk.ctx.uncheckedKinds.has(kind)) {
      report(walk, 'E062', at, `No component kind "${kind}": the engine has none, nor has components/`);
    }
    return;
  }
  checkPart(type.recordType.schema, fields, at, partContext(walk, at, only, 'E063'));
}

/** A placed record's overrides: its fields as they stand here, checked as the record, only the overridden ones reported. */
function checkRecordOverrides(walk: Walk, ref: string, inner: readonly Fields[], over: Fields, at: string): void {
  const key = parseRef(ref);
  const type = key ? walk.ctx.types.get(key.type) : undefined;
  const value = key ? walk.ctx.value(key.type, key.id) : undefined;
  if (!key || !type || value === undefined) return;
  const fields = recordHere(value, [...inner, over]);
  // Checked from the record's root and reported at the override: a problem in a field it leaves
  // alone, or in the record as a whole, is the record's own, reported there.
  const ctx = partContext(walk, at, new Set(Object.keys(over)), 'E065', false);
  checkPart(type.schema, fields, '', {
    ...ctx,
    report: (code, path, message) => ctx.report(code, at + path, message),
    use: (found, path) => ctx.use(found, at + path),
    asset: (path, found) => ctx.asset(at + path, found),
  });
}

/** A prefab placement's overrides, each against the object of its id, seen through the layers inside it. */
function checkPrefabOverrides(
  walk: Walk,
  prefabId: string,
  inner: readonly Fields[],
  over: Fields,
  at: string,
  depth: number,
): void {
  const prefab = walk.prefabs.get(prefabId);
  if (!prefab || depth >= DEEPEST) return;
  for (const [id, change] of Object.entries(over)) {
    const object = prefab.objects.find((o) => o.id === id);
    const here = `${at}/${pointerSegment(id)}`;
    if (!object) {
      report(walk, 'E066', here, `The prefab "${prefabId}" has no object "${id}"`);
      continue;
    }
    const layers = inner.map((layer) => layer[id]);
    if (!overrideFits(walk, object, change, here) || !isFields(change)) continue;
    const base = overridden(object, layers);
    for (const [kind, fields] of Object.entries(isFields(change.components) ? change.components : {})) {
      const own = base.components?.[kind];
      const merged = { ...(isFields(own) ? own : {}), ...(fields as Fields) };
      // A kind the object lacks is added whole, so all of it is the override's.
      const only = isFields(own) ? new Set(Object.keys(fields as Fields)) : undefined;
      checkComponent(walk, kind, merged, `${here}/components/${kind}`, only);
    }
    if (!isFields(change.overrides)) continue;
    const below = passedOn(object, layers);
    if (object.record !== undefined)
      checkRecordOverrides(walk, object.record, below, change.overrides, `${here}/overrides`);
    if (object.prefab !== undefined) {
      checkPrefabOverrides(walk, object.prefab, below, change.overrides, `${here}/overrides`, depth + 1);
    }
  }
}

/** E058 for an override's shape, and for a field the object it changes can't have. */
function overrideFits(walk: Walk, object: SpaceObject, change: unknown, at: string): boolean {
  const issues = schemaIssues(overrideSchema, change);
  for (const issue of issues) report(walk, 'E058', at + issue.path, issue.message);
  if (issues.length > 0 || !isFields(change)) return false;
  let fits = true;
  const refuse = (field: string, message: string) => {
    report(walk, 'E058', `${at}/${field}`, message);
    fits = false;
  };
  if (object.shape === undefined && change.shape !== undefined) refuse('shape', 'Only a shape can change its shape');
  if (object.shape === undefined && change.color !== undefined) refuse('color', 'Only a shape has a colour of its own');
  if (object.shape !== undefined && change.overrides !== undefined)
    refuse('overrides', 'A shape places nothing to override');
  return fits;
}

const inside = (path: string, at: string) => path === at || path.startsWith(`${at}/`);

/**
 * checkPart's callbacks for a part at `at`: E001 as `code`, and only what is inside `only`'s fields
 * reported and used, with the part as a whole when `whole` is true.
 */
function partContext(
  walk: Walk,
  at: string,
  only: ReadonlySet<string> | undefined,
  code: DiagnosticCode,
  whole = true,
): PartContext {
  const kept = (path: string) =>
    !only || (whole && path === at) || [...only].some((field) => inside(path, `${at}/${pointerSegment(field)}`));
  return {
    known: walk.ctx.known,
    records: walk.ctx.records,
    report: (found, path, message) => {
      if (kept(path)) report(walk, found === 'E001' ? code : found, path, message);
    },
    use: (key, path) => {
      if (kept(path)) walk.uses.push({ key, file: walk.file, object: walk.object, path });
    },
    asset: (path, value) => {
      if (kept(path) && walk.ctx.assets && !walk.ctx.assets.has(value)) {
        report(walk, 'E018', path, `No file assets/${value}`);
      }
    },
    // A trigger zone's flags (M5.8): set and read in play, so the flags' lint counts them.
    condition: (_path, sound) => {
      for (const ref of conditionRefs(sound.tree, walk.ctx.known.facts)) {
        if (ref.type === FLAG) listFlag(walk.flags.read, ref.id, walk.file);
      }
    },
    effect: (_path, effect) => {
      const sets = effect.effect === 'set-flag' || effect.effect === 'add-to-flag';
      if (sets && typeof effect.flag === 'string') listFlag(walk.flags.set, effect.flag, walk.file);
    },
  };
}

/** The checks that need the project's types and records, each at its line, and the references they found. */
export function checkProjectSpaceParts(
  files: readonly SpaceFileRead[],
  parts: SpacePartsContext,
): { diagnostics: Diagnostic[]; uses: SpaceUse[]; flags: FlagUses } {
  const found = checkSpaceParts(files, parts);
  return { diagnostics: atLines(files, found.diagnostics), uses: found.uses, flags: found.flags };
}
