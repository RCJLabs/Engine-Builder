/**
 * What an import will do before it does it (M2.7): where each file goes and which are refused, by
 * the limits a save can carry (media.ts). Whether the import as a whole can go is pickBlocked's,
 * with the models in it (models/modelImport.ts, M5.5).
 */
import { kindOfAsset } from '@eb/schema';
import { freePath, KIND_FOLDERS } from './assetPaths.ts';
import { LIMITS, sizeText } from './media.ts';

/** A file chosen or dropped: its name and size are all the plan reads. */
export interface Chosen {
  readonly name: string;
  readonly size: number;
}

export interface Planned<F extends Chosen = Chosen> {
  readonly file: F;
  /** Where it goes inside assets/. */
  readonly path: string;
  /** Why it won't be imported. */
  readonly refused: string | null;
}

/**
 * Where each file goes: the folder typed, or its kind's (images/, audio/…), under its own name
 * cleaned, and never over a file that is there, nor over one before it in the same import.
 */
export function planImport<F extends Chosen>(
  files: readonly F[],
  folder: string,
  taken: readonly string[],
): Planned<F>[] {
  const used = [...taken];
  return files.map((file) => {
    const kind = kindOfAsset(file.name);
    const path = freePath(folder || (kind ? KIND_FOLDERS[kind] : ''), file.name, used);
    used.push(path);
    const refused =
      file.size > LIMITS.file ? `Too big: ${sizeText(file.size)}, and the most is ${sizeText(LIMITS.file)}` : null;
    return { file, path, refused };
  });
}
