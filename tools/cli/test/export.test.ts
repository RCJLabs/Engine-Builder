import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const HUT = resolve(import.meta.dirname, 'fixtures/hut');

function eb(args: readonly string[], cwd = tmpdir()) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

const scratch = () => mkdtempSync(join(tmpdir(), 'eb-export-'));

/** A stand-in for apps/editor's dist-game/: the tests run before the build does. */
function runtime(): string {
  const dir = scratch();
  writeFileSync(join(dir, 'files.json'), JSON.stringify({ version: '0.0.1', files: ['game.js', 'game.css'] }));
  writeFileSync(join(dir, 'game.js'), 'console.log("the engine");\n');
  writeFileSync(join(dir, 'game.css'), 'body { margin: 0 }\n');
  return dir;
}

/** The hut with a map of the summit and an export.json whose taster leaves it out. */
function hut(script = ''): string {
  const dir = scratch();
  cpSync(HUT, dir, { recursive: true });
  writeFileSync(join(dir, 'records/item/summit-map.json'), JSON.stringify({ name: 'A map of the summit', value: 40 }));
  writeFileSync(
    join(dir, 'export.json'),
    JSON.stringify({
      editions: { taster: { 'leave-out': { records: ['item:summit-map'] } } },
      targets: {
        file: { edition: 'taster' },
        web: { domain: 'hut.example.com' },
        android: { package: 'com.rcjlabs.thehut' },
      },
    }),
  );
  if (script)
    writeFileSync(join(dir, 'scripts/hut.ts'), `${readFileSync(join(HUT, 'scripts/hut.ts'), 'utf8')}\n${script}\n`);
  return dir;
}

const files = (dir: string, under = ''): string[] =>
  readdirSync(join(dir, under), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(dir, join(under, e.name)) : [join(under, e.name)]))
    .sort();

describe('eb export (M4.10)', () => {
  const run = runtime();

  it('web: a folder to serve, with its worker and version.json', () => {
    const out = join(scratch(), 'web');
    const { code, out: said } = eb(['export', hut(), '--target', 'web', '--out', out, '--runtime', run]);
    expect(code).toBe(0);
    expect(said).toMatch(/^Wrote .*web \(11 files, build [0-9a-f]{12}\)\.\n$/);
    expect(files(out)).toContain('sw.js');
    expect(files(out)).toContain('version.json');
  });

  it('file: the taster as one page, its leak check in words', () => {
    const out = join(scratch(), 'hut.html');
    const { code, out: said } = eb(['export', hut(), '--target', 'file', '--out', out, '--runtime', run]);
    expect(code).toBe(0);
    expect(said).toContain('The leak check read 1 file of the taster build for 2 things it leaves out');
    const page = readFileSync(out, 'utf8');
    expect(page).toContain('console.log("the engine")');
    expect(page).not.toContain('summit-map');
  });

  it('itch and repo: zips, the repository with its workflows', () => {
    const dir = scratch();
    expect(eb(['export', hut(), '--target', 'itch', '--out', join(dir, 'itch.zip'), '--runtime', run]).code).toBe(0);
    expect(Object.keys(unzipSync(readFileSync(join(dir, 'itch.zip'))))).toContain('index.html');
    expect(eb(['export', hut(), '--target', 'repo', '--out', join(dir, 'repo.zip'), '--runtime', run]).code).toBe(0);
    const repo = Object.keys(unzipSync(readFileSync(join(dir, 'repo.zip'))));
    expect(repo).toEqual(
      expect.arrayContaining(['.github/workflows/pages.yml', '.github/workflows/android.yml', 'site/index.html']),
    );
  });

  it('a leak fails it, writing nothing', () => {
    const out = join(scratch(), 'hut.html');
    const { code, out: said } = eb([
      'export',
      hut("export const secret = 'summit-map';"),
      '--target',
      'file',
      '--out',
      out,
      '--runtime',
      run,
    ]);
    expect(code).toBe(1);
    expect(said).toContain('The taster build holds summit-map (item:summit-map)');
    expect(existsSync(out)).toBe(false);
  });

  it('says what is wrong: no runtime, a target there isn’t, an edition there isn’t', () => {
    const missing = eb(['export', hut(), '--target', 'web', '--runtime', join(scratch(), 'none')]);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain('No game runtime in');
    expect(eb(['export', hut(), '--target', 'steam', '--runtime', run]).err).toContain(
      '--target is one of web, file, itch, repo',
    );
    expect(eb(['export', hut(), '--target', 'web', '--edition', 'lite', '--runtime', run]).err).toContain(
      'No edition "lite" in export.json',
    );
    expect(eb(['validate', hut(), '--target', 'web']).err).toContain(
      '--target only applies to eb export and eb publish',
    );
  });
});

describe('eb publish (M4.10)', () => {
  const run = runtime();
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  it('commits the repository into a git working tree, keeps its README, and pushes', () => {
    const remote = scratch();
    git(remote, 'init', '-q', '--bare', '-b', 'main');
    const repo = scratch();
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.name', 'eb');
    git(repo, 'config', 'user.email', 'eb@example.com');
    git(repo, 'remote', 'add', 'origin', remote);
    writeFileSync(join(repo, 'README.md'), '# My own words\n');
    mkdirSync(join(repo, 'site'));
    writeFileSync(join(repo, 'site/old.txt'), 'from an old build');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'Start');
    git(repo, 'push', '-q', '-u', 'origin', 'main');

    const first = eb(['publish', hut(), '--repo', repo, '--push', '--runtime', run]);
    expect(first.code).toBe(0);
    expect(first.out).toMatch(/^Committed \d+ files: Publish the-hut-0\.1\.0, build [0-9a-f]{12}\.\nPushed\.\n$/);
    expect(readFileSync(join(repo, 'README.md'), 'utf8')).toBe('# My own words\n');
    expect(existsSync(join(repo, 'site/old.txt'))).toBe(false);
    expect(git(remote, 'log', '--format=%s', 'main').trim().split('\n')[0]).toMatch(/^Publish the-hut-0\.1\.0/);
    expect(git(repo, 'status', '--porcelain')).toBe('');

    const again = eb(['publish', hut(), '--repo', repo, '--runtime', run]);
    expect(again.out).toBe('Nothing changed since the last publish.\n');
  });

  it('refuses a folder that isn’t a git working tree', () => {
    const { code, err } = eb(['publish', hut(), '--repo', scratch(), '--runtime', run]);
    expect(code).toBe(2);
    expect(err).toContain('isn’t a git working tree');
  });
});
