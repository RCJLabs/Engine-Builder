import { unzipSync } from 'fflate';
import { isHiddenName, memorySource, type ProjectSource } from './source.ts';

/**
 * A project in a zip: one the editor exported, or a folder zipped by an OS. The project may sit
 * at the zip's root or inside a single top folder. Windows tools may write `\` between folders,
 * which counts as `/`. Throws when the bytes are not a zip.
 */
export function zipSource(bytes: Uint8Array): ProjectSource {
  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(unzipSync(bytes))) {
    const path = name.replace(/\\/g, '/');
    if (!path.endsWith('/') && !path.split('/').some(isHiddenName)) files.set(path, data);
  }
  const root = projectRoot([...files.keys()]);
  const inside: Record<string, Uint8Array> = {};
  for (const [path, data] of files) {
    if (path.startsWith(root)) inside[path.slice(root.length)] = data;
  }
  return memorySource(inside);
}

/** "" when project.json is at the top, "folder/" when everything sits in one folder that has it. */
function projectRoot(paths: readonly string[]): string {
  if (paths.includes('project.json')) return '';
  const tops = new Set(paths.map((path) => path.split('/')[0]));
  const [top] = tops;
  return tops.size === 1 && paths.includes(`${top}/project.json`) ? `${top}/` : '';
}
