import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { sampleTypes } from '../../schema/test/samples.ts';
import { FIXTURE_V1, readFixture } from '../test/fixture.ts';
import {
  compileProject,
  type DirectoryHandleLike,
  directorySource,
  type FileHandleLike,
  type HandleLike,
  memorySource,
  type ProjectSource,
  zipSource,
} from './index.ts';

const V1_HASH = '489cedf323bd33d9';
const text = (bytes: Uint8Array | undefined) => (bytes === undefined ? undefined : new TextDecoder().decode(bytes));
const sorted = async (source: ProjectSource, dir: string) => [...(await source.files(dir))].sort();

// A compile-time check that the browser's own handle fits the shape the compiler declares.
const _real: DirectoryHandleLike = null as unknown as FileSystemDirectoryHandle;

type Tree = { readonly [name: string]: string | Tree };

/** A directory handle over a tree of strings, behaving like the File System API, logging every folder it lists. */
function fakeDirectory(name: string, tree: Tree, listed: string[]): DirectoryHandleLike {
  const child = (key: string, kind: 'file' | 'directory'): HandleLike => {
    const node = tree[key];
    if (node === undefined) throw new DOMException(`${key} not found`, 'NotFoundError');
    if ((typeof node === 'string') !== (kind === 'file'))
      throw new DOMException(`${key} is not a ${kind}`, 'TypeMismatchError');
    return typeof node === 'string' ? fakeFile(key, node) : fakeDirectory(key, node, listed);
  };
  return {
    kind: 'directory',
    name,
    async *entries(): AsyncGenerator<[string, HandleLike]> {
      listed.push(name);
      for (const key of Object.keys(tree))
        yield [key, child(key, typeof tree[key] === 'string' ? 'file' : 'directory')];
    },
    getDirectoryHandle: async (key) => child(key, 'directory') as DirectoryHandleLike,
    getFileHandle: async (key) => child(key, 'file') as FileHandleLike,
  };
}

function fakeFile(name: string, content: string): FileHandleLike {
  return { kind: 'file', name, getFile: async () => new Blob([content]) };
}

describe('memorySource', () => {
  const source = memorySource({
    'project.json': '{}',
    'records/item/medkit.json': 'Médkit',
    'records/item/.DS_Store': 'x',
    'records/.git/config': 'x',
    'recordsx/item/a.json': '{}',
  });

  it('lists the files under a folder, leaving out hidden ones and look-alike folders', async () => {
    expect(await sorted(source, 'records')).toEqual(['records/item/medkit.json']);
    expect(await sorted(source, '')).toEqual(['project.json', 'records/item/medkit.json', 'recordsx/item/a.json']);
  });

  it('reads strings back as UTF-8, and misses as undefined', async () => {
    expect(text(await source.read('records/item/medkit.json'))).toBe('Médkit');
    expect(await source.read('records/item/missing.json')).toBeUndefined();
  });
});

describe('directorySource (OPFS and opened folders)', () => {
  const tree: Tree = {
    'project.json': '{"format":1}',
    '.git': { config: '[core]' },
    records: {
      item: { 'medkit.json': '{}', '.DS_Store': 'x' },
      actor: { 'rook.json': '{}' },
      __MACOSX: { '._rook.json': 'x' },
    },
  };

  it('walks folders without entering hidden ones', async () => {
    const listed: string[] = [];
    const source = directorySource(fakeDirectory('salvage-run', tree, listed));
    expect(await sorted(source, 'records')).toEqual(['records/actor/rook.json', 'records/item/medkit.json']);
    expect(await sorted(source, '')).toEqual(['project.json', 'records/actor/rook.json', 'records/item/medkit.json']);
    expect(listed).not.toContain('.git');
    expect(listed).not.toContain('__MACOSX');
  });

  it('reads nested files, and treats a missing file or folder as missing', async () => {
    const source = directorySource(fakeDirectory('salvage-run', tree, []));
    expect(text(await source.read('records/item/medkit.json'))).toBe('{}');
    expect(text(await source.read('project.json'))).toBe('{"format":1}');
    expect(await source.read('records/item/missing.json')).toBeUndefined();
    expect(await source.read('scenes/start.json')).toBeUndefined();
    expect(await source.read('project.json/oops')).toBeUndefined();
    expect(await source.files('scenes')).toEqual([]);
  });

  it('passes on errors that do not mean "missing"', async () => {
    const root = fakeDirectory('salvage-run', tree, []);
    const denied = directorySource({
      ...root,
      getFileHandle: async () => {
        throw new DOMException('denied', 'NotAllowedError');
      },
    });
    await expect(denied.read('project.json')).rejects.toThrow('denied');
  });

  it('compiles the fixture to its golden hash', async () => {
    type Folder = { [name: string]: string | Folder };
    const fixtureTree: Folder = {};
    for (const [path, content] of Object.entries(readFixture(FIXTURE_V1))) {
      const parts = path.split('/');
      let folder = fixtureTree;
      for (const part of parts.slice(0, -1)) {
        const next = folder[part];
        const child: Folder = typeof next === 'object' ? next : {};
        folder[part] = child;
        folder = child;
      }
      folder[parts[parts.length - 1] as string] = content;
    }
    const result = await compileProject(directorySource(fakeDirectory('v1', fixtureTree, [])), sampleTypes);
    expect(result.pack?.hash).toBe(V1_HASH);
  });
});

describe('zipSource', () => {
  const zipOf = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)])));
  const prefixed = (prefix: string, files: Record<string, string>) =>
    Object.fromEntries(Object.entries(files).map(([path, content]) => [`${prefix}${path}`, content]));

  it('compiles a zip of the project to the golden hash', async () => {
    const result = await compileProject(zipSource(zipOf(readFixture(FIXTURE_V1))), sampleTypes);
    expect(result.pack?.hash).toBe(V1_HASH);
  });

  it('finds the project inside a single top folder, past macOS and Windows habits', async () => {
    const files = prefixed('salvage-run/', readFixture(FIXTURE_V1));
    const windows = Object.fromEntries(
      Object.entries(files).map(([path, content]) => [path.replace(/\//g, '\\'), content]),
    );
    const zip = zipOf({ ...windows, '__MACOSX/salvage-run/._project.json': 'x', 'salvage-run/.DS_Store': 'x' });
    const source = zipSource(zip);
    expect(await sorted(source, 'records')).toEqual([
      'records/actor/rook.json',
      'records/item/medkit.json',
      'records/item/salvage.json',
      'records/loot-table/dead-hauler.json',
    ]);
    expect((await compileProject(source, sampleTypes)).pack?.hash).toBe(V1_HASH);
  });

  it('skips folder entries', async () => {
    const zip = zipSync({ 'project.json': strToU8('{}'), records: { item: { 'medkit.json': strToU8('{}') } } });
    expect(await sorted(zipSource(zip), 'records')).toEqual(['records/item/medkit.json']);
  });

  it('leaves the root alone when there is no single project folder', async () => {
    const source = zipSource(zipOf({ 'a/project.json': '{}', 'b/records/item/medkit.json': '{}' }));
    expect(await source.read('project.json')).toBeUndefined();
    expect(await source.read('a/project.json')).toBeDefined();
  });

  it('throws when the bytes are not a zip', () => {
    expect(() => zipSource(strToU8('not a zip'))).toThrow('invalid zip data');
  });
});
