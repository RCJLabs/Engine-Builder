/**
 * What replacing an asset does (M2.7): where the new file goes, when it is refused, and the
 * provenance its form starts from.
 */
import { kindOfAsset } from '@eb/schema';
import { fileName, folderOf, freePath } from './assetPaths.ts';
import { LIMITS, sizeText } from './media.ts';

const extensionOf = (text: string) => (text.includes('.') ? text.slice(text.lastIndexOf('.')).toLowerCase() : '');

/** Where a replacement goes: the same path when its extension is the same, else beside it under a free name. */
export function replacementPath(path: string, name: string, taken: readonly string[]): string {
  if (extensionOf(name) === extensionOf(path)) return path;
  const stem = fileName(path).slice(0, fileName(path).length - extensionOf(path).length);
  return freePath(
    folderOf(path),
    `${stem}${extensionOf(name)}`,
    taken.filter((other) => other !== path),
  );
}

/** Why a file can't replace the asset at `path`: another kind, which the records naming it don't ask for, or too big. */
export function replaceProblem(path: string, file: { readonly name: string; readonly size: number }): string | null {
  const kind = kindOfAsset(path);
  if (kindOfAsset(file.name) !== kind) {
    return `Replace it with ${kind ? `another ${kind === 'audio' ? 'sound' : kind}` : 'a file of the same kind'}.`;
  }
  return file.size > LIMITS.file ? `Too big: ${sizeText(file.size)}, and the most is ${sizeText(LIMITS.file)}.` : null;
}

/**
 * The old entry to start the replacement's from, without its date and hand edits; nothing over
 * a stand-in, whose entry says the editor made it, which real art never is.
 */
export function keptEntry(old: unknown): Record<string, unknown> {
  if (typeof old !== 'object' || old === null || Array.isArray(old)) return {};
  const entry = old as Record<string, unknown>;
  if (entry.standIn === true) return {};
  return Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'edits' && key !== 'date'));
}
