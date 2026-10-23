/**
 * One export, start to end (docs/specs/export.md#building-an-edition): a target's files from the
 * runtime and the edition's pack, read by the leak check against the full game's, and packed as
 * the file to save. The editor and eb export both run this, after compiling the packs.
 */
import { type ExportJson, FULL, leaveOutOf } from '@eb/compiler';
import { zipSync } from 'fflate';
import { byPath } from './hash.ts';
import { checkLeaks, type LeakReport, leakTokens } from './leaks.ts';
import {
  type BuildPack,
  engineTexts,
  type Files,
  gameInfo,
  itchFiles,
  type Runtime,
  repoFiles,
  singleFile,
  webFiles,
} from './targets.ts';

/** What Export makes: the three targets, and Publish's repository. Android rides in the repository. */
export const EXPORT_TARGETS = ['web', 'file', 'itch', 'repo'] as const;
export type ExportTarget = (typeof EXPORT_TARGETS)[number];

export interface ExportRequest {
  readonly target: ExportTarget;
  readonly settings: ExportJson | undefined;
  readonly edition: string;
  /** The edition's pack. */
  readonly pack: BuildPack;
  /** The full game's pack, for the leak check: needed when the edition leaves anything out. */
  readonly full?: BuildPack;
  readonly runtime: Runtime;
  /** export.json's icon, read from assets/. */
  readonly icon?: Uint8Array;
}

export interface Exported {
  /** The name to save it under. */
  readonly name: string;
  /** What to save: a zip, or the single HTML file. */
  readonly bytes: Uint8Array;
  /** The files as built, by path: a folder's worth, or the one file. */
  readonly files: Files;
  /** The web build's hash, from version.json; none for the file and itch targets. */
  readonly build?: string;
  /** The leak check, or null for an edition that leaves nothing out. */
  readonly leaks: LeakReport | null;
  /** False when the leak check found something, or couldn't see something: then nothing is saved. */
  readonly ok: boolean;
}

// Midnight on 1 January 1980, zip's earliest date, built from local parts at each call, as
// @eb/compiler's zipProject does: every machine writes the same bytes, whatever its time zone.
const zipEpoch = () => new Date(1980, 0, 1);

/** Files as a zip, paths sorted and every entry dated alike, so the same files give the same bytes. */
export function zipFiles(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const path of [...files.keys()].sort(byPath)) entries[path] = files.get(path) as Uint8Array;
  return zipSync(entries, { level: 6, mtime: zipEpoch() });
}

async function filesOf(target: ExportTarget, input: Parameters<typeof webFiles>[0]): Promise<Files> {
  if (target === 'web') return webFiles(input);
  if (target === 'itch') return itchFiles(input);
  if (target === 'repo') return repoFiles(input);
  const { name, bytes } = singleFile(input);
  return new Map([[name, bytes]]);
}

const versionOf = (files: Files): string | undefined => {
  const bytes = files.get('version.json') ?? files.get('site/version.json');
  return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as { build: string }).build : undefined;
};

export async function exportGame(request: ExportRequest): Promise<Exported> {
  const { target, settings, edition, pack, runtime, icon } = request;
  const input = { settings, edition, pack, runtime, ...(icon ? { icon } : {}) };
  const files = await filesOf(target, input);
  let leaks: LeakReport | null = null;
  const out = leaveOutOf(settings, edition);
  const tokens = request.full ? leakTokens(request.full, out) : [];
  if (edition !== FULL && request.full) {
    const full = await filesOf(target, { ...input, edition: FULL, pack: request.full });
    leaks = checkLeaks(files, full, engineTexts(runtime), tokens);
  } else if (edition !== FULL) {
    throw new Error(`The ${edition} edition’s leak check needs the full game’s pack`);
  }
  const ok = leaks === null || (leaks.finds.length === 0 && leaks.unseen.length === 0);
  const info = gameInfo({ settings, pack });
  const suffix = edition === FULL ? '' : `-${edition}`;
  const build = versionOf(files);
  if (target === 'file') {
    const [[name, bytes]] = [...files] as [[string, Uint8Array]];
    return { name, bytes, files, leaks, ok };
  }
  const name =
    target === 'repo'
      ? `${info.game}-${info.version}${suffix}-repo.zip`
      : `${info.game}-${info.version}${suffix}-${target}.zip`;
  return { name, bytes: zipFiles(files), files, ...(build ? { build } : {}), leaks, ok };
}
