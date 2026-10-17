import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import type { FileChange } from './history.ts';
import { workingCopy } from './workingCopy.ts';

const text = (s: string) => new TextEncoder().encode(s);
const read = async (copy: ReturnType<typeof workingCopy>, path: string) => {
  const bytes = await copy.read(path);
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
};

const stored = () =>
  memorySource({
    'project.json': '{"name":"Old"}',
    'records/item/medkit.json': '{}',
    'records/item/.gitkeep': '',
  });

describe('workingCopy', () => {
  it('reads edits over the stored files, and the stored files elsewhere', async () => {
    const copy = workingCopy(stored());
    const change: FileChange = { path: 'project.json', before: text('{"name":"Old"}'), after: text('{"name":"New"}') };
    copy.apply([change], 'after');
    expect(await read(copy, 'project.json')).toBe('{"name":"New"}');
    expect(await read(copy, 'records/item/medkit.json')).toBe('{}');
    copy.apply([change], 'before');
    expect(await read(copy, 'project.json')).toBe('{"name":"Old"}');
  });

  it('lists files added and leaves out files removed, under the folder asked for', async () => {
    const copy = workingCopy(stored());
    copy.apply(
      [
        { path: 'records/item/bandage.json', before: null, after: text('{}') },
        { path: 'records/item/medkit.json', before: text('{}'), after: null },
        { path: 'records/.hidden.json', before: null, after: text('{}') },
      ],
      'after',
    );
    expect([...(await copy.files('records'))].sort()).toEqual(['records/item/bandage.json']);
    expect([...(await copy.files(''))].sort()).toEqual(['project.json', 'records/item/bandage.json']);
    expect(await copy.read('records/item/medkit.json')).toBeUndefined();
  });

  it('keeps a file unsaved when it changed again while a save ran', async () => {
    const copy = workingCopy(stored());
    copy.apply([{ path: 'a.json', before: null, after: text('1') }], 'after');
    const saving = copy.unsaved();
    copy.apply([{ path: 'b.json', before: null, after: text('2') }], 'after');
    copy.apply([{ path: 'a.json', before: text('1'), after: text('3') }], 'after');
    copy.saved(saving);
    expect([...copy.unsaved().keys()].sort()).toEqual(['a.json', 'b.json']);
    copy.saved(copy.unsaved());
    expect(copy.unsaved().size).toBe(0);
  });

  it('counts a removed file as saved once its removal is written', () => {
    const copy = workingCopy(stored());
    copy.apply([{ path: 'records/item/medkit.json', before: text('{}'), after: null }], 'after');
    copy.saved(copy.unsaved());
    expect(copy.unsaved().size).toBe(0);
  });
});
