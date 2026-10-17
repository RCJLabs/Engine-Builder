import { type UnzipFileInfo, unzipSync } from 'fflate';
import { isHiddenName, memorySource, type ProjectSource } from './source.ts';

/** The most a zip may hold, counted from its own listing before anything is unpacked. */
export interface ZipLimits {
  readonly maxFiles: number;
  /** Bytes once unpacked. */
  readonly maxBytes: number;
}

/**
 * A project in a zip: one the editor exported, or a folder zipped by an OS. The project may sit
 * at the zip's root or inside a single top folder. Windows tools may write `\` between folders,
 * which counts as `/`. Throws when the bytes are not a zip, or with a RangeError when they pass
 * `limits`.
 *
 * The limits trust the sizes the zip declares. fflate unpacks no file past its declared size, so
 * memory stays bounded either way, but a zip that understates a size gets that file cut short,
 * silently: fflate checks no CRCs. A cut record then fails to parse (E007), like a damaged one.
 */
export function zipSource(bytes: Uint8Array, limits?: ZipLimits): ProjectSource {
  let count = 0;
  let total = 0;
  const wanted = (file: UnzipFileInfo): boolean => {
    const path = file.name.replace(/\\/g, '/');
    if (path.endsWith('/') || path.split('/').some(isHiddenName)) return false;
    count += 1;
    total += file.originalSize;
    if (limits && count > limits.maxFiles) throw new RangeError(`This zip holds more than ${limits.maxFiles} files.`);
    if (limits && total > limits.maxBytes) {
      throw new RangeError(`This zip unpacks to more than ${Math.round(limits.maxBytes / 1_000_000)} MB.`);
    }
    return true;
  };
  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(unzipSync(bytes, { filter: wanted }))) {
    files.set(name.replace(/\\/g, '/'), data);
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
