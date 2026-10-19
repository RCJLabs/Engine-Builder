/**
 * A project's ink scenes as the compiler reads them (M3.11, D49, docs/specs/ink.md): every file
 * under scenes/ placed and named, each scenes/<id>.ink compiled into the talk <id>, which is then
 * checked as any talk is. A scene with a problem of its own makes no talk to check, so its checks
 * don't pile on; it is still a talk, so what names it doesn't fail as well. The checks' places in
 * a talk are given back as the scene's lines.
 */
import { type FactCatalog, isRecordId } from '@eb/core';
import { compileScene, lineAt, type SourceMap } from '@eb/ink';
import { DIALOGUE, TALK } from '@eb/kits';
import { type Diagnostic, type DiagnosticCode, type RecordInput, severityOf } from '@eb/schema';
import type { ProjectSource } from './source.ts';

export const SCENES_DIR = 'scenes';
export const scenePath = (id: string) => `${SCENES_DIR}/${id}.ink`;

export type SceneFile =
  | { readonly kind: 'scene'; readonly id: string }
  | { readonly kind: 'misplaced'; readonly reason: string }
  | { readonly kind: 'ignored' };

/** What a file under scenes/ is: its name is its talk's id, as a record's is. */
export function classifyScene(path: string): SceneFile {
  const parts = path.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (!name.endsWith('.ink')) return { kind: 'ignored' };
  if (parts.length !== 2 || parts[0] !== SCENES_DIR) {
    return { kind: 'misplaced', reason: 'A scene sits at scenes/<id>.ink, not in a folder of its own' };
  }
  const id = name.slice(0, -'.ink'.length);
  if (!isRecordId(id)) {
    return {
      kind: 'misplaced',
      reason: `"${id}" isn’t a talk’s id: name a scene in lowercase words joined by hyphens`,
    };
  }
  return { kind: 'scene', id };
}

export interface ScenesRead {
  /** Every scene by id, sorted. */
  readonly ids: readonly string[];
  /** A talk for each scene: unreadable when the scene has a problem of its own. */
  readonly records: readonly RecordInput[];
  /** Each scene's map, by its file, from its talk's places to its lines. */
  readonly maps: ReadonlyMap<string, SourceMap>;
  /** E046, E012, E013 and W131, in no order. */
  readonly diagnostics: readonly Diagnostic[];
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
// UTF-16 order, the same in every locale.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface At {
  readonly line?: number;
  readonly column?: number;
  readonly id?: string;
}

const diagnostic = (file: string, code: DiagnosticCode, message: string, at: At = {}): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  ...(at.id === undefined ? {} : { type: TALK, id: at.id }),
  file,
  path: '',
  ...(at.line === undefined ? {} : { line: at.line }),
  ...(at.column === undefined ? {} : { column: at.column }),
});

export async function readScenes(
  source: ProjectSource,
  facts: FactCatalog,
  kits: readonly string[],
): Promise<ScenesRead> {
  const diagnostics: Diagnostic[] = [];
  const records: RecordInput[] = [];
  const maps = new Map<string, SourceMap>();
  for (const file of [...(await source.files(SCENES_DIR))].sort(byText)) {
    const role = classifyScene(file);
    if (role.kind === 'ignored') diagnostics.push(diagnostic(file, 'W131', 'Ignored: scenes are scenes/<id>.ink'));
    if (role.kind === 'misplaced') diagnostics.push(diagnostic(file, 'E046', role.reason));
    if (role.kind !== 'scene') continue;
    const { id } = role;
    const text = decode(await source.read(file));
    const failed = (message: string) => {
      diagnostics.push(diagnostic(file, 'E046', message, { id }));
      records.push({ type: TALK, id, file, value: undefined, unreadable: true });
    };
    if (!kits.includes(DIALOGUE)) failed('A scene compiles into a talk: turn the dialogue kit on in project.json');
    else if (text === undefined) failed('Not valid UTF-8 text');
    else {
      const scene = compileScene(text, { facts });
      for (const p of scene.problems) diagnostics.push(diagnostic(file, p.code, p.message, { ...p, id }));
      records.push({
        type: TALK,
        id,
        file,
        value: scene.talk,
        ...(scene.talk === undefined ? { unreadable: true } : {}),
      });
      maps.set(file, scene.map);
    }
  }
  const ids = records.map((r) => r.id).sort(byText);
  return { ids, records, maps, diagnostics };
}

/** A check of a scene's talk at the scene's line: the nearest place in the talk its map has. */
export function atSceneLine(d: Diagnostic, maps: ReadonlyMap<string, SourceMap>): Diagnostic {
  const map = d.file === undefined ? undefined : maps.get(d.file);
  if (map === undefined || d.line !== undefined) return d;
  const line = lineAt(map, d.path);
  return line === undefined ? d : { ...d, line };
}

const decode = (bytes: Uint8Array | undefined): string | undefined => {
  if (bytes === undefined) return undefined;
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};
