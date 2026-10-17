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
  type RecordType,
  readTypeFile,
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
  /** The code types, the data types, and a stand-in for each type file that has problems. */
  readonly types: readonly RecordType[];
  /** The types whose files have problems: their records aren't checked. */
  readonly unchecked: ReadonlySet<string>;
  /** The data types that are sound, by name, for forms. */
  readonly data: ReadonlyMap<string, DataType>;
}

const typeFile = (type: string) => `${TYPES_DIR}/${type}.json`;

export async function readTypes(
  source: ProjectSource,
  code: readonly RecordType[],
  report: (r: TypeReport) => void,
): Promise<ProjectTypes> {
  const taken = new Set(code.map((t) => t.type));
  const files = new Map<string, TypeFile | null>();
  for (const path of [...(await source.files(TYPES_DIR))].sort()) {
    const found = await readOne(source, path, taken, report);
    if (found) files.set(found.type, found.file);
  }
  // Every type there is, sound or not, so a ref to a type whose file has problems isn't one more.
  const known = new Set([...taken, ...files.keys()]);
  const data = new Map<string, DataType>();
  for (const [type, file] of files) {
    if (file === null) continue;
    const unknown = typeRefs(file).filter((r) => !known.has(r.type));
    for (const r of unknown) {
      const message = `No record type "${r.type}": add ${typeFile(r.type)}, or name a type the project has`;
      report({ code: 'E016', message, file: typeFile(type), path: r.path });
    }
    if (unknown.length === 0) data.set(type, typeFromFile(type, file));
  }
  const unchecked = new Set([...files.keys()].filter((type) => !data.has(type)));
  const standIns = [...unchecked].map((type) => standIn(type));
  return { types: [...code, ...[...data.values()].map((d) => d.recordType), ...standIns], unchecked, data };
}

/** One file under types/: its type and field model, null for a type whose file has problems, or nothing. */
async function readOne(
  source: ProjectSource,
  path: string,
  taken: ReadonlySet<string>,
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
  const read = readTypeFile(parsed.value);
  if (read.ok) return { type, file: read.file };
  for (const issue of read.issues) report({ code: 'E015', ...issue, file: path });
  return { type, file: null };
}

// It checks nothing: the records of a type with problems are marked unreadable before validation.
const standIn = (type: string): RecordType =>
  defineRecordType({ type, title: type, description: 'A type whose file has problems', schema: z.strictObject({}) });
