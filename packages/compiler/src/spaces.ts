/**
 * Spaces and prefabs (M5.1, D63): spaces/<id>.json is one place in a 3D world, and
 * prefabs/<id>.json a group of objects placed by reference. Their shape is E058; two objects of one
 * id in a file E059; a placement of a prefab prefabs/ lacks E060; a prefab that places itself, by
 * any road, E061. Nothing packs them yet: a game draws spaces from M5.8. The spec is
 * docs/specs/viewport.md.
 */
import { type Diagnostic, type DiagnosticCode, schemaIssues, severityOf } from '@eb/schema';
import { parseJsonFile } from './decode.ts';
import { placeOfPointer } from './jsonLines.ts';
import { type NavFileRead, navHeader } from './navFiles.ts';
import type { ProjectSource } from './source.ts';
import { classifySpaceFile, PREFABS_DIR, SPACES_DIR, type SpaceKind } from './spaceFiles.ts';
import { type SpaceJson, type SpaceObject, spaceSchema } from './spaceShape.ts';
import { checkTerrains, pngHeader, type TerrainFileRead } from './terrains.ts';

/** A file under spaces/ or prefabs/ as read: its value is undefined when it isn't JSON (E007). */
export interface SpaceFileRead {
  readonly file: string;
  readonly kind: SpaceKind;
  readonly id: string;
  readonly value: unknown;
  readonly text?: string;
}

const at = (file: string, code: DiagnosticCode, path: string, message: string): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  file,
  path,
});

/** Each file's shape, ids and placements checked against the prefabs there are; and a space's terrain files (M5.3). */
export function checkSpaces(files: readonly SpaceFileRead[], terrains: readonly TerrainFileRead[] = []): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const sound = new Map<string, { read: SpaceFileRead; space: SpaceJson }>();
  for (const read of files) {
    if (read.value === undefined) continue;
    const issues = schemaIssues(spaceSchema, read.value);
    if (issues.length > 0) {
      diagnostics.push(...issues.map((issue) => at(read.file, 'E058', issue.path, issue.message)));
      continue;
    }
    const space = read.value as SpaceJson;
    if (read.kind === 'prefab' && space.terrain !== undefined) {
      diagnostics.push(at(read.file, 'E058', '/terrain', 'Only a space has a terrain: a prefab is placed in one'));
      continue;
    }
    if (read.kind === 'prefab' && space.environment !== undefined) {
      diagnostics.push(
        at(read.file, 'E058', '/environment', 'Only a space has an environment: a prefab takes its space’s'),
      );
      continue;
    }
    sound.set(read.file, { read, space });
  }
  const spaces = [...sound.values()].filter(({ read }) => read.kind === 'space');
  diagnostics.push(
    ...checkTerrains(
      new Map(spaces.map(({ read, space }) => [read.id, { file: read.file, space }])),
      new Set(files.filter((f) => f.kind === 'space').map((f) => f.id)),
      terrains,
    ),
  );
  const prefabs = new Set(files.filter((f) => f.kind === 'prefab').map((f) => f.id));
  for (const { read, space } of sound.values()) {
    const seen = new Set<string>();
    space.objects.forEach((object, i) => {
      if (seen.has(object.id)) {
        diagnostics.push(at(read.file, 'E059', `/objects/${i}/id`, `Another object is already "${object.id}"`));
      }
      seen.add(object.id);
      if (object.prefab !== undefined && !prefabs.has(object.prefab)) {
        diagnostics.push(at(read.file, 'E060', `/objects/${i}/prefab`, `No prefab "${object.prefab}" in prefabs/`));
      }
    });
  }
  diagnostics.push(...cycles(sound));
  return diagnostics;
}

/** E061 at each placement that leads a prefab back to itself. */
function cycles(sound: ReadonlyMap<string, { read: SpaceFileRead; space: SpaceJson }>): Diagnostic[] {
  const places = new Map<string, { file: string; objects: readonly SpaceObject[] }>();
  for (const { read, space } of sound.values()) {
    if (read.kind === 'prefab') places.set(read.id, { file: read.file, objects: space.objects });
  }
  const reaches = (from: string, target: string, seen: Set<string>): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (places.get(from)?.objects ?? []).some((o) => o.prefab !== undefined && reaches(o.prefab, target, seen));
  };
  const found: Diagnostic[] = [];
  for (const [prefab, { file, objects }] of places) {
    objects.forEach((object, i) => {
      if (object.prefab === undefined || !reaches(object.prefab, prefab, new Set())) return;
      const how = object.prefab === prefab ? 'itself' : `itself through "${object.prefab}"`;
      found.push(at(file, 'E061', `/objects/${i}/prefab`, `The prefab "${prefab}" places ${how}`));
    });
  }
  return found;
}

/**
 * The files under spaces/ and prefabs/, read: W141 for a file that's neither, E007 for one that
 * isn't JSON; a terrain's PNGs as far as their headers (M5.3), and a navmesh's (M6.2).
 */
export async function readSpaces(source: ProjectSource): Promise<{
  files: SpaceFileRead[];
  terrains: TerrainFileRead[];
  navs: NavFileRead[];
  diagnostics: Diagnostic[];
}> {
  const files: SpaceFileRead[] = [];
  const terrains: TerrainFileRead[] = [];
  const navs: NavFileRead[] = [];
  const diagnostics: Diagnostic[] = [];
  const paths = [...(await source.files(SPACES_DIR)), ...(await source.files(PREFABS_DIR))].sort();
  for (const file of paths) {
    const role = classifySpaceFile(file);
    if (role.kind === 'ignored') continue;
    if (role.kind === 'terrain') {
      const bytes = await source.read(file);
      terrains.push({ file, id: role.id, part: role.part, header: bytes ? pngHeader(bytes) : null });
      continue;
    }
    if (role.kind === 'nav') {
      const bytes = await source.read(file);
      navs.push({ file, id: role.id, header: bytes ? navHeader(bytes) : null });
      continue;
    }
    if (role.kind === 'misplaced') {
      diagnostics.push(at(file, 'W141', '', role.reason));
      continue;
    }
    const bytes = await source.read(file);
    const parsed = bytes === undefined ? ({ ok: false, message: 'Missing file' } as const) : parseJsonFile(bytes);
    if (!parsed.ok) {
      diagnostics.push(at(file, 'E007', '', parsed.message));
      files.push({ file, kind: role.kind, id: role.id, value: undefined });
      continue;
    }
    const text = bytes === undefined ? undefined : new TextDecoder().decode(bytes);
    files.push({ file, kind: role.kind, id: role.id, value: parsed.value, ...(text !== undefined ? { text } : {}) });
  }
  return { files, terrains, navs, diagnostics };
}

/** Each problem at its line and column as well as its path, as the screens' are. */
export function atLines(files: readonly SpaceFileRead[], found: readonly Diagnostic[]): Diagnostic[] {
  const texts = new Map(files.map((f) => [f.file, f.text]));
  return found.map((d) => {
    const text = d.file === undefined ? undefined : texts.get(d.file);
    const place = text === undefined ? undefined : placeOfPointer(text, d.path);
    return place ? { ...d, ...place } : d;
  });
}

/**
 * The files' own checks, each at its line. Those that read the project's types and records are
 * spaceParts.ts's checkProjectSpaceParts, apart so the editor's start, which runs these, carries
 * none of them (M5.2).
 */
export function checkProjectSpaces(
  files: readonly SpaceFileRead[],
  terrains: readonly TerrainFileRead[] = [],
): Diagnostic[] {
  return atLines(files, checkSpaces(files, terrains));
}
