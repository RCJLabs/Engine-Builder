import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import type { Timers } from './autosave.ts';
import { editSession } from './editSession.ts';
import type { SavedFile } from './journal.ts';
import { manifestChange } from './projectEdits.ts';
import { workingCopy } from './workingCopy.ts';

const MANIFEST = '{\n  "format": 1,\n  "id": "salvage-run",\n  "name": "Salvage Run",\n  "version": "0.1.0"\n}\n';
const noTimers: Timers = { set: () => 0, clear: () => undefined };

function setup() {
  const copy = workingCopy(memorySource({ 'project.json': MANIFEST }));
  const writes: SavedFile[][] = [];
  const told: string[] = [];
  let clock = 0;
  const session = editSession({
    copy,
    write: async (files) => void writes.push(files),
    changed: (changes) => told.push(changes.map((c) => c.path).join()),
    now: () => clock,
    timers: noTimers,
  });
  const name = async () =>
    (JSON.parse(new TextDecoder().decode((await copy.read('project.json')) ?? new Uint8Array())) as { name: string })
      .name;
  // null for no group: undefined would take the default.
  const rename = (to: string, at: number, group: string | null = 'name') => {
    clock = at;
    return session.edit(
      'Rename the project',
      async (c) => {
        const change = await manifestChange(c, 'name', to);
        return change ? [change] : [];
      },
      group ?? undefined,
    );
  };
  return { copy, session, writes, told, name, rename };
}

describe('editSession', () => {
  it('edits, undoes and redoes the files, telling what changed each time', async () => {
    const { session, name, rename, told } = setup();
    await rename('Dirtbag', 0);
    expect(await name()).toBe('Dirtbag');
    expect((await session.undo())?.label).toBe('Rename the project');
    expect(await name()).toBe('Salvage Run');
    await session.redo();
    expect(await name()).toBe('Dirtbag');
    expect(told).toEqual(['project.json', 'project.json', 'project.json']);
    expect(await session.redo()).toBeNull();
  });

  it('runs edits in the order asked, each reading the files after the one before', async () => {
    const { session, name, rename } = setup();
    // Not awaited one by one: typed faster than a file is read.
    await Promise.all([rename('D', 0), rename('Di', 100), rename('Dir', 200)]);
    expect(await name()).toBe('Dir');
    expect(session.history.value.past).toHaveLength(1);
    await session.undo();
    expect(await name()).toBe('Salvage Run');
  });

  it('gives each edit the file as the edit before it left it, so undo goes back one at a time', async () => {
    const { session, name, rename } = setup();
    // Ungrouped: three steps, each of whose befores must be the one before's after.
    await Promise.all([rename('D', 0, null), rename('Di', 0, null), rename('Dir', 0, null)]);
    await session.undo();
    expect(await name()).toBe('Di');
    await session.undo();
    expect(await name()).toBe('D');
  });

  it('keeps typing in one field as one step, and a pause as the next', async () => {
    const { session, rename } = setup();
    await rename('A', 0);
    await rename('AB', 400);
    await rename('ABC', 2000);
    expect(session.history.value.past.map((step) => step.changes.length)).toEqual([1, 1]);
  });

  it('marks the project unsaved after an edit and saves on flush', async () => {
    const { session, rename, writes } = setup();
    await rename('Dirtbag', 0);
    expect(session.saveState.value.kind).toBe('unsaved');
    await session.flush();
    expect(session.saveState.value.kind).toBe('saved');
    expect(writes.map((files) => files.map((f) => f.path))).toEqual([['project.json']]);
  });

  it('counts an edit as pending from the moment it is asked for until it is made', async () => {
    const { session, rename } = setup();
    const made = rename('Dirtbag', 0);
    expect(session.pending.value).toBe(1);
    await made;
    expect(session.pending.value).toBe(0);
  });

  it('skips an edit that changes nothing', async () => {
    const { session, rename } = setup();
    await rename('Salvage Run', 0);
    expect(session.history.value.past).toEqual([]);
    expect(session.saveState.value.kind).toBe('saved');
  });
});
