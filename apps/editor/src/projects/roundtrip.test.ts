/**
 * Phase 2's gate. A project in a git checkout, copied into the browser's storage and exported as
 * a zip, unpacks over the checkout with zero diff (M2.1); edited in place through an opened
 * folder, it changes by exactly the lines edited, and by nothing once the edit is undone (M2.3). The files hold what
 * tends to get lost on the way: a byte order mark, Windows line ends, no last newline, text past
 * ASCII, tabs, a binary file, a notes file among the records, and the repo's own files around the
 * project. Python's zipfile unpacks the export, so the check doesn't lean on our own zip reader.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { directorySource, zipProject } from '@eb/compiler';
import { afterAll, describe, expect, it } from 'vitest';
import { fsFolder } from '../../test/fs-folder.ts';
import { MemoryDirectory } from '../../test/memory-fs.ts';
import type { Timers } from '../editing/autosave.ts';
import { editSession } from '../editing/editSession.ts';
import { saveIntoFolder } from '../editing/folderSave.ts';
import { manifestChange } from '../editing/projectEdits.ts';
import { workingCopy } from '../editing/workingCopy.ts';
import { createLibrary } from './library.ts';
import { writeFiles } from './opfsWrite.ts';

// Built from its code: a formatter may turn the escape into an invisible character.
const BOM = String.fromCharCode(0xfeff);

const PROJECT: Record<string, string | Uint8Array> = {
  'project.json': `${BOM}{\r\n  "format": 1,\r\n  "id": "round-trip",\r\n  "name": "Ünïcødé ✓",\r\n  "version": "1.0.0"\r\n}\r\n`,
  'records/item/medkit.json': '{"name":"Médkit ✓","heal":5}',
  'records/actor/rook.json': '{\n\t"name": "Rook"\n}\n',
  'records/item/notes.md': '# Notes kept beside the records\n',
  'records/.gitkeep': '',
  'assets/tiny.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]),
};
const REPO: Record<string, string> = {
  'README.md': '# The game around the project\n',
  'package.json': '{}\n',
  '.gitignore': 'node_modules/\n',
  'node_modules/dep/index.js': 'module.exports = 1;\n',
};

const scratch = mkdtempSync(join(tmpdir(), 'eb-roundtrip-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function checkout(name: string): string {
  const dir = join(scratch, name);
  for (const [path, content] of Object.entries({ ...PROJECT, ...REPO })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      encoding: 'utf8',
    });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'the project as it was');
  return dir;
}

describe('a git folder, into the browser and out as a zip', () => {
  it('unpacks over its checkout with zero diff, carrying only the project', async () => {
    const dir = checkout('round-trip');
    const opfs = new MemoryDirectory();
    const library = createLibrary(await opfs.getDirectoryHandle('projects', { create: true }), (folder, files) =>
      writeFiles(opfs, ['projects', folder], files),
    );
    const folder = await library.copyIn(directorySource(fsFolder(dir)));
    const zip = await zipProject(await library.open(folder), 'round-trip');

    const zipPath = join(scratch, 'export.zip');
    writeFileSync(zipPath, zip);
    const unpack =
      'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); print("\\n".join(z.namelist())); z.extractall(sys.argv[2])';
    const names = execFileSync('python3', ['-I', '-c', unpack, zipPath, scratch], { encoding: 'utf8' })
      .trim()
      .split('\n');

    // .gitkeep is hidden, so it stays in the checkout but not in the zip.
    const carried = Object.keys(PROJECT).filter((path) => path !== 'records/.gitkeep');
    expect(names).toEqual(carried.map((path) => `round-trip/${path}`).sort());
    expect(readdirSync(dir).sort()).toEqual([
      '.git',
      '.gitignore',
      'README.md',
      'assets',
      'node_modules',
      'package.json',
      'project.json',
      'records',
    ]);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' })).toBe('');
  });
});

describe('a git folder, edited in place', () => {
  const noTimers: Timers = { set: () => 0, clear: () => undefined };
  const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

  it('changes by the one line edited, and by nothing once the edit is undone', async () => {
    const dir = checkout('edited-in-place');
    const folder = fsFolder(dir);
    const session = editSession({
      copy: workingCopy(directorySource(folder)),
      write: (files) => saveIntoFolder(folder, files),
      timers: noTimers,
    });
    const rename = (to: string) =>
      session.edit('Rename the project', async (copy) => {
        const change = await manifestChange(copy, 'name', to);
        return change ? [change] : [];
      });

    await rename('Renamed');
    await session.undo();
    await session.flush();
    expect(git(dir, 'status', '--porcelain')).toBe('');

    await rename('Renamed');
    await session.flush();
    expect(git(dir, 'status', '--porcelain')).toBe(' M project.json\n');
    // The byte order mark and Windows line ends stay: one line out, one line in.
    expect(git(dir, 'diff', '--numstat')).toBe('1\t1\tproject.json\n');
    expect(
      git(dir, 'diff', '-U0', '--no-color')
        .split('\n')
        .filter((line) => /^[-+] /.test(line)),
    ).toEqual(['-  "name": "Ünïcødé ✓",\r', '+  "name": "Renamed",\r']);
  });
});
