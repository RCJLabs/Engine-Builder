/**
 * eb export and eb publish (M4.10, D60, docs/specs/export.md): a project's game made for one
 * target, as the editor's Export section makes it, from the runtime apps/editor builds into
 * dist-game/. Publish writes the repository into a git working tree and commits with your own git.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  type CompileResult,
  compileWithGame,
  EXPORT_FILE,
  type ExportJson,
  editionOf,
  editionSource,
  leaveOutOf,
  type ProjectSource,
} from '@eb/compiler';
import { type BuildPack, EXPORT_TARGETS, type ExportTarget, exportGame, leakWords, type Runtime } from '@eb/export';
import { UsageError } from './modules.ts';
import { formatResult } from './report.ts';

const DEFAULT_RUNTIME = resolve(import.meta.dirname, '../../../apps/editor/dist-game');

export interface ExportFlags {
  readonly target?: string;
  readonly out?: string;
  readonly edition?: string;
  readonly runtime?: string;
}

async function readRuntime(dir = DEFAULT_RUNTIME): Promise<Runtime> {
  const list = join(dir, 'files.json');
  if (!existsSync(list)) {
    throw new UsageError(
      `No game runtime in ${dir}: build it with "pnpm -C apps/editor exec vite build -c vite.game.config.ts", or name one with --runtime`,
    );
  }
  const { version, files, walk, nav, stage2d } = JSON.parse(await readFile(list, 'utf8')) as {
    version: string;
    files: string[];
    walk?: string;
    nav?: string;
    stage2d?: string;
  };
  const [js, css] = await Promise.all(files.map((file) => readFile(join(dir, file), 'utf8')));
  // walk.js, for a game with spaces (M5.8): apps/editor builds it beside the runtime.
  const walked = walk === undefined ? undefined : await readFile(join(dir, walk), 'utf8');
  // nav.js, for a game whose spaces have navmeshes (M6.2), built beside walk.js.
  const navved = nav === undefined ? undefined : await readFile(join(dir, nav), 'utf8');
  // stage2d.js, for a game with a 2D space (M7.1), built beside them.
  const flat = stage2d === undefined ? undefined : await readFile(join(dir, stage2d), 'utf8');
  return {
    version,
    js: js as string,
    css: css as string,
    ...(walked === undefined ? {} : { walk: walked }),
    ...(navved === undefined ? {} : { nav: navved }),
    ...(flat === undefined ? {} : { stage2d: flat }),
  };
}

async function readSettings(source: ProjectSource): Promise<ExportJson | undefined> {
  const bytes = await source.read(EXPORT_FILE);
  return bytes === undefined ? undefined : (JSON.parse(new TextDecoder().decode(bytes)) as ExportJson);
}

const plain = (result: CompileResult): BuildPack => JSON.parse(JSON.stringify(result.pack)) as BuildPack;

/** The target's files and words, or the problems that stop it: compiled, built and leak checked. */
async function made(source: ProjectSource, target: ExportTarget, flags: ExportFlags) {
  const full = await compileWithGame(source);
  if (!full.pack) return { problems: formatResult(full, true) };
  const settings = await readSettings(source);
  const edition = flags.edition ?? editionOf(settings, target === 'repo' ? 'web' : target);
  if (edition !== 'full' && !settings?.editions?.[edition]) {
    throw new UsageError(`No edition "${edition}" in export.json`);
  }
  const cut = edition === 'full' ? full : await compileWithGame(editionSource(source, leaveOutOf(settings, edition)));
  if (!cut.pack) return { problems: [`The ${edition} edition:`, ...formatResult(cut, true)] };
  const icon = settings?.icon ? await source.read(`assets/${settings.icon}`) : undefined;
  const result = await exportGame({
    target,
    settings,
    edition,
    pack: plain(cut),
    full: plain(full),
    runtime: await readRuntime(flags.runtime),
    ...(icon ? { icon } : {}),
  });
  return { result, edition, words: result.leaks ? leakWords(edition, result.leaks) : [] };
}

async function writeFiles(
  dir: string,
  files: ReadonlyMap<string, Uint8Array>,
  skip: (path: string) => boolean = () => false,
) {
  const written: string[] = [];
  for (const [path, bytes] of files) {
    if (skip(path)) continue;
    const to = join(dir, path);
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, bytes);
    written.push(path);
  }
  return written;
}

export async function runExport(source: ProjectSource, flags: ExportFlags): Promise<number> {
  const target = flags.target as ExportTarget;
  if (!EXPORT_TARGETS.includes(target)) throw new UsageError(`--target is one of ${EXPORT_TARGETS.join(', ')}`);
  const done = await made(source, target, flags);
  if ('problems' in done) {
    for (const line of done.problems ?? []) console.log(line);
    return 1;
  }
  const { result, words } = done;
  for (const line of words) console.log(line);
  if (!result.ok) return 1;
  const out = flags.out ?? (target === 'web' ? result.name.replace(/\.zip$/, '') : result.name);
  if (target === 'web') {
    await rm(out, { recursive: true, force: true });
    await writeFiles(out, result.files);
  } else {
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(out, result.bytes);
  }
  const what = target === 'web' ? `${result.files.size} files` : `${result.bytes.byteLength} bytes`;
  console.log(`Wrote ${out} (${what}${result.build ? `, build ${result.build}` : ''}).`);
  return 0;
}

export interface PublishFlags extends ExportFlags {
  readonly repo?: string;
  readonly message?: string;
  readonly push?: boolean;
}

const git = (repo: string, args: readonly string[]) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** The repository's files written into a git working tree, committed, and pushed with --push. */
export async function runPublish(source: ProjectSource, flags: PublishFlags): Promise<number> {
  const repo = flags.repo;
  if (!repo) throw new UsageError('eb publish needs --repo <folder>, a git working tree');
  try {
    if (git(repo, ['rev-parse', '--is-inside-work-tree']).trim() !== 'true') throw new Error('not a work tree');
  } catch {
    throw new UsageError(`${repo} isn’t a git working tree: clone your game's repository, or run git init there`);
  }
  const done = await made(source, 'repo', flags);
  if ('problems' in done) {
    for (const line of done.problems ?? []) console.log(line);
    return 1;
  }
  const { result, words } = done;
  for (const line of words) console.log(line);
  if (!result.ok) return 1;
  // site/ is the build's alone: a file a later build drops goes with it.
  await rm(join(repo, 'site'), { recursive: true, force: true });
  const keepReadme = existsSync(join(repo, 'README.md'));
  const written = await writeFiles(repo, result.files, (path) => path === 'README.md' && keepReadme);
  git(repo, ['add', '--all', '--', 'site', ...written.filter((p) => !p.startsWith('site/'))]);
  const staged = git(repo, ['diff', '--cached', '--name-only']).trim();
  if (staged === '') {
    console.log('Nothing changed since the last publish.');
    return 0;
  }
  const message = flags.message ?? `Publish ${result.name.replace(/-repo\.zip$/, '')}, build ${result.build}`;
  git(repo, ['commit', '-q', '-m', message]);
  console.log(`Committed ${staged.split('\n').length} files: ${message}.`);
  if (flags.push) {
    git(repo, ['push', '-q']);
    console.log('Pushed.');
  }
  return 0;
}
