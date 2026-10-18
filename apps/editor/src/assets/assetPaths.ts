/**
 * Where imported files go (M2.7): their kind's folder unless another is given, under a name the
 * asset path format takes (type-files.md, Assets), and never over a file that is there already.
 */
import type { AssetKind } from '@eb/schema';

/** The folder each kind goes in when the import gives none. */
export const KIND_FOLDERS: Record<AssetKind, string> = {
  image: 'images',
  audio: 'audio',
  model: 'models',
  font: 'fonts',
};

/**
 * A folder or file name the format takes: the characters a zip made anywhere can't hold become
 * "-", and a leading dot goes, since the compiler never reads hidden files.
 */
export function cleanName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '-')
    .trim()
    .replace(/^\.+/, '');
  return cleaned === '' || cleaned === '__MACOSX' ? 'file' : cleaned;
}

/** A folder as typed: each part cleaned, empty ones dropped. "" is assets/ itself. */
export const cleanFolder = (folder: string): string =>
  folder
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map(cleanName)
    .join('/');

/**
 * The path for `fileName` in `folder` that no file in `taken` has: "hero.png", else "hero-2.png",
 * "hero-3.png"… Compared case aside, as a Mac's or Windows's disk would.
 */
export function freePath(folder: string, fileName: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((path) => path.toLowerCase()));
  const name = cleanName(fileName);
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  const at = (n: number) => `${folder ? `${folder}/` : ''}${n === 1 ? stem : `${stem}-${n}`}${ext}`;
  for (let n = 1; ; n++) if (!used.has(at(n).toLowerCase())) return at(n);
}

/** The name at the end of a path. */
export const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** The folder a path is in, or "" for assets/ itself. */
export const folderOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
