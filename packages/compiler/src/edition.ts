/**
 * An edition's files (M4.10, D60): the project's, less what the edition leaves out, so compiling
 * them gives the pack of a project that never had those things. Leaving out a type hides its
 * records and its type file; a scene is its talk; an asset goes with its line in the provenance
 * log, so its credit goes too. export.json goes, since its lists name what is no longer there.
 */
import { parseRef } from '@eb/core';
import { leavesOutRecord } from './exportCheck.ts';
import { EXPORT_FILE, type LeaveOut } from './exportFile.ts';
import { ASSETS_DIR, ASSETS_LOG, classifyRecordFile, classifyTypeFile, RECORDS_DIR, TYPES_DIR } from './layout.ts';
import { classifyScene, SCENES_DIR } from './sceneFiles.ts';
import type { ProjectSource } from './source.ts';

/** Whether the edition hides this file of the project. */
export function hiddenByEdition(out: LeaveOut, path: string): boolean {
  if (path === EXPORT_FILE) return true;
  const top = path.split('/')[0];
  if (top === RECORDS_DIR) {
    const role = classifyRecordFile(path);
    return role.kind === 'record' && leavesOutRecord(out, `${role.type}:${role.id}`);
  }
  if (top === TYPES_DIR) {
    const role = classifyTypeFile(path);
    return role.kind === 'type' && out.types.includes(role.type);
  }
  if (top === SCENES_DIR) {
    const role = classifyScene(path);
    return role.kind === 'scene' && leavesOutRecord(out, `talk:${role.id}`);
  }
  if (top === ASSETS_DIR && path !== ASSETS_LOG) return out.assets.includes(path.slice(ASSETS_DIR.length + 1));
  return false;
}

/** The provenance log without the lines of left-out assets; as it was if it isn't the log's shape. */
function logWithout(bytes: Uint8Array, assets: readonly string[]): Uint8Array {
  let log: unknown;
  try {
    log = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return bytes;
  }
  const files = (log as { files?: unknown } | null)?.files;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return bytes;
  const kept = Object.fromEntries(Object.entries(files).filter(([path]) => !assets.includes(path)));
  return new TextEncoder().encode(`${JSON.stringify({ ...(log as object), files: kept }, null, 2)}\n`);
}

/** The project's files as the edition sees them. Nothing is copied: reads go to `source`. */
export function editionSource(source: ProjectSource, out: LeaveOut): ProjectSource {
  return {
    files: async (dir) => (await source.files(dir)).filter((path) => !hiddenByEdition(out, path)),
    read: async (path) => {
      if (hiddenByEdition(out, path)) return undefined;
      const bytes = await source.read(path);
      return path === ASSETS_LOG && bytes !== undefined && out.assets.length > 0
        ? logWithout(bytes, out.assets)
        : bytes;
    },
  };
}

/** Whether an edition leaves anything out at all. */
export const leavesOutAnything = (out: LeaveOut): boolean =>
  out.types.length + out.records.length + out.scenes.length + out.assets.length > 0;

/** Each left-out record key that exists, from the project's records: what the leak check looks for. */
export function leftOutRecords(out: LeaveOut, records: Iterable<string>): string[] {
  return [...records].filter((key) => parseRef(key) && leavesOutRecord(out, key)).sort();
}
