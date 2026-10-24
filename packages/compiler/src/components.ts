/**
 * The component kinds a project's objects can carry (M5.2, D64): the engine's five and the
 * project's own, components/<kind>.json, each a type file read as types/ reads one. A kind's file
 * with problems still names its kind, so components of it aren't E062 as well: they wait,
 * unchecked, until the file is fixed. The spec is docs/specs/components.md.
 */
import {
  type DataType,
  type Diagnostic,
  type DiagnosticCode,
  ENGINE_COMPONENTS,
  isEngineComponent,
  readTypeFile,
  severityOf,
  typeFromFile,
  typeRefs,
} from '@eb/schema';
import { parseJsonFile } from './decode.ts';
import type { ProjectSource } from './source.ts';
import { COMPONENTS_DIR, classifyComponentFile, componentPath } from './spaceFiles.ts';

export interface ComponentKinds {
  /** The kinds that are sound, the engine's first, by id. */
  readonly kinds: ReadonlyMap<string, DataType>;
  /** The project's kinds whose files have problems. */
  readonly unchecked: ReadonlySet<string>;
  readonly diagnostics: readonly Diagnostic[];
}

const at = (file: string, code: DiagnosticCode, path: string, message: string): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  file,
  path,
});

/** The kinds there are; `types` are the record types a kind's ref fields may name (E016). */
export async function readComponentKinds(source: ProjectSource, types: ReadonlySet<string>): Promise<ComponentKinds> {
  const kinds = new Map(ENGINE_COMPONENTS);
  const unchecked = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const file of [...(await source.files(COMPONENTS_DIR))].sort()) {
    const role = classifyComponentFile(file);
    if (role.kind === 'ignored') {
      diagnostics.push(at(file, 'W143', '', 'Ignored: component kinds are components/<kind>.json'));
      continue;
    }
    if (role.kind === 'misplaced') {
      diagnostics.push(at(file, 'E017', '', role.reason));
      continue;
    }
    if (isEngineComponent(role.id)) {
      const message = `"${role.id}" is one of the engine's component kinds, so this file is ignored: name yours otherwise`;
      diagnostics.push(at(file, 'E017', '', message));
      continue;
    }
    const found = await readKind(source, role.id, types, (d) => diagnostics.push(d));
    if (found) kinds.set(role.id, found);
    else unchecked.add(role.id);
  }
  return { kinds, unchecked, diagnostics };
}

async function readKind(
  source: ProjectSource,
  kind: string,
  types: ReadonlySet<string>,
  report: (d: Diagnostic) => void,
): Promise<DataType | null> {
  const file = componentPath(kind);
  const bytes = await source.read(file);
  const parsed = bytes === undefined ? ({ ok: false, message: 'Missing file' } as const) : parseJsonFile(bytes);
  if (!parsed.ok) {
    report(at(file, 'E007', '', parsed.message));
    return null;
  }
  const read = readTypeFile(parsed.value);
  if (!read.ok) {
    for (const issue of read.issues) report(at(file, 'E015', issue.path, issue.message));
    return null;
  }
  const unknown = typeRefs(read.file).filter((r) => !types.has(r.type));
  for (const r of unknown) {
    report(at(file, 'E016', r.path, `No record type "${r.type}": name a type the project has`));
  }
  return unknown.length === 0 ? typeFromFile(kind, read.file) : null;
}
