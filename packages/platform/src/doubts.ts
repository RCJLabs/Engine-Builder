import { type SaveFile, type SaveProblem, verifySaveFile } from '@eb/core';

/**
 * Why a copy of a save went to quarantine: it would not load (a SaveProblem, or the game threw),
 * another tab wrote it after this one last saw it, or an update changed it on load.
 */
export type QuarantineReason = SaveProblem | 'crashed' | 'conflict' | 'changed';

export function parse(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export interface Doubt {
  readonly problem: QuarantineReason;
  readonly message: string;
}

/**
 * Why the save in a slot must be kept before a write replaces it, or undefined when it can be
 * replaced: it is damaged, from a newer game, or another tab wrote it after this one last saw
 * it. These are the saves that landnam, 2060td, ludus, football, afterglass and space-wrecked
 * each treated as empty and wrote over.
 */
export function replaceDoubt(
  existing: string,
  next: SaveFile,
  lastSeen: string | undefined,
  game: string,
): Doubt | undefined {
  const parsed = parse(existing);
  const verified = parsed === undefined ? undefined : verifySaveFile(parsed, game);
  if (!verified) return { problem: 'damaged', message: 'The save is not JSON' };
  if (!verified.ok) return { problem: verified.problem, message: verified.message };
  const saved = versionsIn(verified.file);
  if (!saved) return { problem: 'cannot-migrate', message: "The save's kernel has no module versions" };
  const now = versionsIn(next) ?? {};
  // Only modules both saves have: a slice the new save lacks says nothing about which game is newer.
  const ahead = Object.keys(saved).filter((m) => m in now && Number(saved[m]) > Number(now[m]));
  if (ahead.length > 0) return { problem: 'newer', message: `Saved by a newer game: ${ahead.join(', ')}` };
  if (lastSeen !== undefined && verified.file.check !== lastSeen) {
    return { problem: 'conflict', message: 'Another tab or device saved here after this one last did' };
  }
  return undefined;
}

// verifySaveFile checks the file, not the snapshot inside it, so a checksummed file may still lack these.
function versionsIn(file: SaveFile): Readonly<Record<string, unknown>> | undefined {
  const versions = (file.snapshot.kernel as { readonly versions?: unknown } | undefined)?.versions;
  return typeof versions === 'object' && versions !== null
    ? (versions as Readonly<Record<string, unknown>>)
    : undefined;
}
