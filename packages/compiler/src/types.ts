/**
 * The record types a project defines in types/ (docs/specs/type-files.md, D31), read beside the
 * game's code types. A type file with problems still names its type, so its records aren't
 * reported as of an unknown type as well: they exist, for references, but aren't checked until
 * the type file is fixed. One problem, one diagnostic.
 */
import { isRecordId } from '@eb/core';
import {
  type DataType,
  type DiagnosticCode,
  defineRecordType,
  ENGINE_TYPES,
  FLAG_TYPE,
  isEngineType,
  joinKitType,
  kitOf,
  kitTypeFiles,
  type RecordType,
  readTypeFile,
  SHEET_DATA,
  type TypeFile,
  typeFromFile,
  typeRefs,
  z,
} from '@eb/schema';
import { parseJsonFile } from './decode.ts';
import { classifyTypeFile, TYPES_DIR } from './layout.ts';
import type { ProjectSource } from './source.ts';

export interface TypeReport {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly file: string;
  readonly path: string;
}

export interface ProjectTypes {
  /** The engine's types, the kits', the code types, the data types, and a stand-in for each type file that has problems. */
  readonly types: readonly RecordType[];
  /** The types whose files have problems: their records aren't checked. */
  readonly unchecked: ReadonlySet<string>;
  /** The data types that are sound, by name, for forms: the engine's flag and sheet (D36) and the kits' (D41) among them. */
  readonly data: ReadonlyMap<string, DataType>;
}

const typeFile = (type: string) => `${TYPES_DIR}/${type}.json`;

/**
 * The project's types, with the kits on (M3.3, D41): a kit's type is the engine's, and a
 * project's types/<type>.json for it adds fields after the kit's. Throws on a programmer error:
 * a game's code defining a type a kit that is on has.
 */
export async function readTypes(
  source: ProjectSource,
  code: readonly RecordType[],
  report: (r: TypeReport) => void,
  kits: readonly string[] = [],
): Promise<ProjectTypes> {
  const kitFiles = kitTypeFiles(kits);
  for (const t of code) {
    if (kitFiles.has(t.type)) {
      throw new Error(
        `The game's code defines "${t.type}", which the ${kitOf(t.type, kits)} kit has (D41): name yours otherwise`,
      );
    }
  }
  const taken = new Set([...ENGINE_TYPES, ...code].map((t) => t.type));
  const files = new Map<string, TypeFile | null>();
  for (const path of [...(await source.files(TYPES_DIR))].sort()) {
    const found = await readOne(source, path, { taken, kitFiles }, report);
    if (found) files.set(found.type, found.file);
  }
  // Every type there is, sound or not, so a ref to a type whose file has problems isn't one more.
  const known = new Set([...taken, ...kitFiles.keys(), ...files.keys()]);
  const data = new Map<string, DataType>([
    [FLAG_TYPE.type, FLAG_TYPE],
    [SHEET_DATA.type, SHEET_DATA],
  ]);
  for (const [type, file] of kitFiles) if (!files.has(type)) data.set(type, kitType(type, file, kits));
  for (const [type, file] of files) {
    if (file === null) continue;
    const unknown = typeRefs(file).filter((r) => !known.has(r.type));
    for (const r of unknown) {
      const message = `No record type "${r.type}": add ${typeFile(r.type)}, or name a type the project has`;
      report({ code: 'E016', message, file: typeFile(type), path: r.path });
    }
    if (unknown.length === 0) data.set(type, kitFiles.has(type) ? kitType(type, file, kits) : typeFromFile(type, file));
  }
  const unchecked = new Set([...files.keys()].filter((type) => !data.has(type)));
  const standIns = [...unchecked].map((type) => standIn(type));
  const own = [...data.values()].filter((d) => !isEngineType(d.type)).map((d) => d.recordType);
  return { types: [...ENGINE_TYPES, ...code, ...own, ...standIns], unchecked, data };
}

/** A kit's type, its own fields marked so the type designer keeps them as they are. */
function kitType(type: string, file: TypeFile, kits: readonly string[]): DataType {
  const fields = Object.keys(kitTypeFiles(kits).get(type)?.fields ?? {});
  return { ...typeFromFile(type, file), kit: { id: kitOf(type, kits) as string, fields } };
}

interface Taken {
  readonly taken: ReadonlySet<string>;
  readonly kitFiles: ReadonlyMap<string, TypeFile>;
}

/** One file under types/: its type and field model, null for a type whose file has problems, or nothing. */
async function readOne(
  source: ProjectSource,
  path: string,
  { taken, kitFiles }: Taken,
  report: (r: TypeReport) => void,
): Promise<{ type: string; file: TypeFile | null } | undefined> {
  const role = classifyTypeFile(path);
  if (role.kind === 'ignored') {
    report({ code: 'W105', message: 'Ignored: type files are types/<type>.json', file: path, path: '' });
    return undefined;
  }
  if (role.kind === 'misplaced') {
    report({ code: 'E017', message: 'A type file must sit at types/<type>.json', file: path, path: '' });
    return undefined;
  }
  const { type } = role;
  if (!isRecordId(type)) {
    const message = `"${type}" is not a valid type name: use lowercase words joined by hyphens, at most 64 characters`;
    report({ code: 'E017', message, file: path, path: '' });
    return undefined;
  }
  if (isEngineType(type)) {
    const message = `"${type}" is one of the engine's own types (D36), so this file is ignored: name yours otherwise`;
    report({ code: 'E017', message, file: path, path: '' });
    return undefined;
  }
  if (taken.has(type)) {
    const message = `The game's code already defines the type "${type}", so this file is ignored`;
    report({ code: 'E017', message, file: path, path: '' });
    return undefined;
  }
  const bytes = await source.read(path);
  const parsed = bytes === undefined ? ({ ok: false, message: 'Missing file' } as const) : parseJsonFile(bytes);
  if (!parsed.ok) {
    report({ code: 'E007', message: parsed.message, file: path, path: '' });
    return { type, file: null };
  }
  const kitFile = kitFiles.get(type);
  const joined = kitFile ? joinKitType(kitFile, parsed.value) : { joined: parsed.value, clashes: [] };
  for (const name of joined.clashes) {
    const message = `The kit's ${type} already has a field "${name}" (D41): name yours otherwise`;
    report({ code: 'E037', message, file: path, path: `/fields/${name}` });
  }
  const read = readTypeFile(joined.joined);
  if (read.ok) return { type, file: read.file };
  for (const issue of read.issues) report({ code: 'E015', ...issue, file: path });
  return { type, file: null };
}

// It checks nothing: the records of a type with problems are marked unreadable before validation.
const standIn = (type: string): RecordType =>
  defineRecordType({ type, title: type, description: 'A type whose file has problems', schema: z.strictObject({}) });
