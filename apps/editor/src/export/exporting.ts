/**
 * Export (M4.10, D60): the open project's game for one target, made on this page from the
 * runtime the editor keeps and the packs its Play worker compiles (docs/specs/export.md). Like Play
 * and Export game, it runs the game's scripts, so they must be allowed to run; it saves nothing
 * while the project has errors, or while the leak check finds what an edition leaves out.
 */
import { EXPORT_FILE, type ExportJson, editionOf, leaveOutOf, parseJsonFile } from '@eb/compiler';
import { type BuildPack, type ExportTarget, exportGame, leakWords, type Runtime } from '@eb/export';
import { signal } from '@preact/signals';
import { note, noteError } from '../app/state.ts';
import { playClient } from '../play/playClient.ts';
import { saveFile } from '../projects/download.ts';
import { current } from '../projects/opened.ts';
import { sizeText } from '../projects/storage.ts';
import { playFiles } from '../scripts/playFiles.ts';

/** The target being exported, while one is. */
export const exporting = signal<ExportTarget | null>(null);

/** What the last export said: what it wrote, the leak check's words, or why it wrote nothing. */
export const exportReport = signal<{ readonly ok: boolean; readonly lines: readonly string[] } | null>(null);

const WORDS: Record<ExportTarget, string> = {
  web: 'the web build',
  file: 'the single file',
  itch: 'the itch.io zip',
  repo: 'the repository',
};

/**
 * The runtime of an exported game, from the editor's own build (runtime/, which its service
 * worker keeps): a read of this site's files, never the network's, so it works offline.
 */
async function readRuntime(): Promise<Runtime> {
  const base = new URL('runtime/', document.baseURI);
  const list = await fetch(new URL('files.json', base))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const listed = list as { version?: string; files?: string[]; walk?: string; nav?: string; stage2d?: string } | null;
  if (listed?.files?.length !== 2) {
    throw new Error('This editor has no game runtime to export with: it was built without one.');
  }
  const read = (file: string) => fetch(new URL(file, base)).then((r) => r.text());
  const [js, css] = await Promise.all(listed.files.map(read));
  const walk = listed.walk === undefined ? undefined : await read(listed.walk);
  const nav = listed.nav === undefined ? undefined : await read(listed.nav);
  const stage2d = listed.stage2d === undefined ? undefined : await read(listed.stage2d);
  return {
    version: String(listed.version),
    js: js as string,
    css: css as string,
    ...(walk === undefined ? {} : { walk }),
    ...(nav === undefined ? {} : { nav }),
    ...(stage2d === undefined ? {} : { stage2d }),
  };
}

/** export.json as written, or undefined when there is none; a broken one stops the export. */
async function readSettings(read: (path: string) => Promise<Uint8Array | undefined>): Promise<ExportJson | undefined> {
  const bytes = await read(EXPORT_FILE);
  if (bytes === undefined) return undefined;
  const parsed = parseJsonFile(bytes);
  if (!parsed.ok) throw new Error(`export.json isn’t JSON: ${parsed.message}`);
  return parsed.value as ExportJson;
}

// Its own worker: packing runs the game's scripts, and needn't wait on a game in play.
let worker: ReturnType<typeof playClient> | null = null;

async function packOf(files: Awaited<ReturnType<typeof playFiles>>, leaveOut?: ReturnType<typeof leaveOutOf>) {
  worker ??= playClient();
  const reply = await worker.send({ kind: 'pack', files, ...(leaveOut ? { leaveOut } : {}) });
  if (reply.kind === 'refused') {
    const n = reply.errors.length;
    const where = leaveOut ? 'This edition has' : 'The project has';
    throw new Error(
      `${where} ${n === 1 ? 'an error' : `${n} errors`}: ${reply.errors
        .map((d) => d.message)
        .slice(0, 3)
        .join('; ')}`,
    );
  }
  if (reply.kind !== 'packed') throw new Error(reply.kind === 'failed' ? reply.message : 'The pack didn’t come back');
  return reply.pack as BuildPack;
}

export async function exportTo(target: ExportTarget): Promise<void> {
  const open = current.value;
  if (!open || exporting.value) return;
  exporting.value = target;
  exportReport.value = null;
  try {
    if (open.game.status !== 'loaded') {
      throw new Error('Exporting runs the game’s scripts: let them run, and fix them, in the Logic panel first.');
    }
    const settings = await readSettings((path) => open.source.read(path));
    const edition = editionOf(settings, target === 'repo' ? 'web' : target);
    const files = await playFiles(open.source);
    const full = await packOf(files);
    const pack = edition === 'full' ? full : await packOf(files, leaveOutOf(settings, edition));
    const icon = settings?.icon ? await open.source.read(`assets/${settings.icon}`) : undefined;
    const made = await exportGame({
      target,
      settings,
      edition,
      pack,
      full,
      runtime: await readRuntime(),
      ...(icon ? { icon } : {}),
    });
    const leaks = made.leaks ? leakWords(edition, made.leaks) : [];
    if (!made.ok) {
      exportReport.value = {
        ok: false,
        lines: [`Nothing was saved: ${WORDS[target]} would hold what the ${edition} edition leaves out.`, ...leaks],
      };
      noteError(`Export of ${WORDS[target]} stopped: the leak check found what the ${edition} edition leaves out.`);
      return;
    }
    saveFile(made.bytes, made.name, target === 'file' ? 'text/html' : 'application/zip');
    const said = `Exported ${made.name} (${sizeText(made.bytes.byteLength)})${made.build ? `, build ${made.build}` : ''}.`;
    exportReport.value = { ok: true, lines: [said, ...leaks] };
    note(said);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    exportReport.value = { ok: false, lines: [message] };
    noteError(`Export of ${WORDS[target]} failed: ${message}`);
  } finally {
    exporting.value = null;
  }
}
