import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { FIXTURE_V1, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { MemoryDirectory } from '../../test/memory-fs.ts';
import type { DirectoryLike, ProjectFile } from './files.ts';
import { createLibrary, type WriteInto } from './library.ts';
import { writeFiles } from './opfsWrite.ts';

// A compile-time check that OPFS's own handle fits the shape the editor's storage declares.
const _opfs: DirectoryLike = null as unknown as FileSystemDirectoryHandle;

const fixture = readFixture(FIXTURE_V1);
const text = (data: Uint8Array | undefined) => (data === undefined ? undefined : new TextDecoder().decode(data));

function setUp(write?: WriteInto) {
  const opfs = new MemoryDirectory();
  const root = new MemoryDirectory('projects');
  opfs.children.set('projects', root);
  const into: WriteInto = write ?? ((folder, files) => writeFiles(opfs, ['projects', folder], files));
  return { root, library: createLibrary(root, into) };
}

describe('createLibrary', () => {
  it('creates a project holding a project.json laid out as a person would write it', async () => {
    const { root, library } = setUp();
    expect(await library.create('  Salvage Run  ')).toBe('salvage-run');
    expect(Object.keys(root.files())).toEqual(['salvage-run/project.json']);
    expect(text(root.files()['salvage-run/project.json'])).toBe(
      '{\n  "format": 1,\n  "id": "salvage-run",\n  "name": "Salvage Run",\n  "version": "0.1.0"\n}\n',
    );
    expect(await library.list()).toEqual([
      { folder: 'salvage-run', name: 'Salvage Run', id: 'salvage-run', version: '0.1.0', trouble: null },
    ]);
  });

  it('gives a second project with the same id a folder of its own', async () => {
    const { library } = setUp();
    await library.create('Salvage Run');
    expect(await library.create('Salvage run')).toBe('salvage-run-2');
    expect(await library.create('salvage RUN')).toBe('salvage-run-3');
    expect((await library.list()).map((entry) => entry.folder).sort()).toEqual([
      'salvage-run',
      'salvage-run-2',
      'salvage-run-3',
    ]);
  });

  it('copies in a project’s own files, byte for byte, and nothing else', async () => {
    const { root, library } = setUp();
    const repo = memorySource({
      ...fixture,
      'README.md': '# game',
      'node_modules/x/index.js': 'x',
      'records/.gitkeep': '',
    });
    expect(await library.copyIn(repo)).toBe('salvage-run');
    const copied = root.files();
    expect(Object.keys(copied).sort()).toEqual(
      Object.keys(fixture)
        .map((path) => `salvage-run/${path}`)
        .sort(),
    );
    for (const [path, content] of Object.entries(fixture))
      expect(text(copied[`salvage-run/${path}`]), path).toBe(content);
    const source = await library.open('salvage-run');
    expect(text(await source.read('records/item/medkit.json'))).toBe(fixture['records/item/medkit.json']);
  });

  it('refuses a source that isn’t a project, writing nothing', async () => {
    const { root, library } = setUp();
    await expect(library.copyIn(memorySource({ 'records/item/a.json': '{}' }))).rejects.toThrow('no project.json');
    await expect(
      library.copyIn(memorySource({ 'project.json': '{"format":1,"id":"Bad Id","name":"x","version":"1.0.0"}' })),
    ).rejects.toThrow('project.json: id: Not a valid project id');
    await expect(library.copyIn(memorySource({ 'project.json': '{"format":2}' }))).rejects.toThrow('format 2');
    await expect(library.copyIn(memorySource({ 'project.json': '{' }))).rejects.toThrow('Not valid JSON');
    expect(root.children.size).toBe(0);
  });

  it('shows a copy cut short as unfinished, never as a project, and can delete it', async () => {
    let calls = 0;
    const { root, library } = setUp(async (folder, files: readonly ProjectFile[]) => {
      if (++calls === 2) throw new Error('The disk is full.');
      const opfs = new MemoryDirectory();
      opfs.children.set('projects', root);
      await writeFiles(opfs, ['projects', folder], files);
    });
    await expect(library.copyIn(memorySource(fixture))).rejects.toThrow('The disk is full.');
    const [entry] = await library.list();
    expect(entry).toMatchObject({
      folder: 'salvage-run',
      id: null,
      trouble: expect.stringContaining('stopped before the end'),
    });
    await library.remove('salvage-run');
    expect(await library.list()).toEqual([]);
  });

  it('lists only folders, says what is wrong with a broken one, and sorts by name', async () => {
    const root = MemoryDirectory.of(
      {
        'zebra/project.json': '{"format":1,"id":"zebra","name":"Aardvark","version":"1.0.0"}',
        'empty/notes.md': 'no manifest',
        'broken/project.json': '{"format":1,',
        '.hidden/project.json': '{}',
        'stray.json': '{}',
      },
      'projects',
    );
    const listed = await createLibrary(root, async () => undefined).list();
    expect(listed.map((entry) => [entry.folder, entry.name, entry.trouble === null])).toEqual([
      ['zebra', 'Aardvark', true],
      ['broken', 'broken', false],
      ['empty', 'empty', false],
    ]);
    expect(listed[1]?.trouble).toContain('Not valid JSON');
    expect(listed[2]?.trouble).toBe('It has no project.json.');
  });

  it('deletes a project and everything in it', async () => {
    const { root, library } = setUp();
    await library.copyIn(memorySource(fixture));
    await library.remove('salvage-run');
    expect(root.children.size).toBe(0);
  });
});
