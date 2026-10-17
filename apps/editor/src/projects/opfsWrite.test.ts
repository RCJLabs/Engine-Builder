import { describe, expect, it } from 'vitest';
import { MemoryDirectory } from '../../test/memory-fs.ts';
import { writeFiles } from './opfsWrite.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array | undefined) => (data === undefined ? undefined : new TextDecoder().decode(data));

describe('writeFiles', () => {
  it('writes files under the base, making the folders they need', async () => {
    const root = new MemoryDirectory();
    await writeFiles(
      root,
      ['projects', 'salvage-run'],
      [
        { path: 'project.json', bytes: bytes('{}') },
        { path: 'records/item/medkit.json', bytes: bytes('{"heal":5}') },
      ],
    );
    expect(Object.keys(root.files())).toEqual([
      'projects/salvage-run/project.json',
      'projects/salvage-run/records/item/medkit.json',
    ]);
    expect(text(root.files()['projects/salvage-run/records/item/medkit.json'])).toBe('{"heal":5}');
  });

  it('replaces a longer file with a shorter one, leaving nothing of the old', async () => {
    const root = MemoryDirectory.of({ 'p/a.json': '{"long":"a long old value"}' });
    await writeFiles(root, ['p'], [{ path: 'a.json', bytes: bytes('{}') }]);
    expect(text(root.files()['p/a.json'])).toBe('{}');
  });

  it('refuses a path that would leave its folder, or an empty name', async () => {
    for (const path of ['../escape.json', 'records//a.json', 'records/./a.json', 'a\\b.json', '']) {
      await expect(writeFiles(new MemoryDirectory(), ['p'], [{ path, bytes: bytes('x') }]), path).rejects.toThrow(
        "can't be a file or folder name",
      );
    }
    await expect(writeFiles(new MemoryDirectory(), ['..'], [{ path: 'a', bytes: bytes('x') }])).rejects.toThrow();
  });

  it('closes each file even when writing it fails, so the next write can open it', async () => {
    const root = MemoryDirectory.of({ 'p/a.json': 'old' });
    const file = await (await root.getDirectoryHandle('p')).getFileHandle('a.json');
    const open = file.createSyncAccessHandle.bind(file);
    file.createSyncAccessHandle = async () => ({ ...(await open()), write: () => 0 });
    await expect(writeFiles(root, ['p'], [{ path: 'a.json', bytes: bytes('new') }])).rejects.toThrow(
      'Wrote 0 of 3 bytes to a.json.',
    );
    expect(file.locked).toBe(false);
  });
});
