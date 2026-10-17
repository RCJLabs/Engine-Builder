import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { fakeLocks } from '../../test/fake-locks.ts';
import type { SavedFile } from './journal.ts';
import { createEditing, type EditTarget, HAND_OVER_MS } from './projectEditing.ts';
import { manifestChange } from './projectEdits.ts';
import type { TabMessage, Tabs } from './tabs.ts';
import { workingCopy } from './workingCopy.ts';

const MANIFEST = '{\n  "format": 1,\n  "id": "salvage-run",\n  "name": "Salvage Run",\n  "version": "0.1.0"\n}\n';
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** Tabs on one channel: a message reaches every tab but the sender, later, as BroadcastChannel's do. */
function channel() {
  const tabs = new Set<{ deliver(message: TabMessage): void; frozen: boolean }>();
  return (): Tabs & { frozen: boolean } => {
    const handlers = new Set<(message: TabMessage) => void>();
    const me = {
      frozen: false,
      deliver: (message: TabMessage) => {
        if (!me.frozen) for (const handler of handlers) handler(message);
      },
      post: (message: TabMessage) => {
        for (const tab of tabs) if (tab !== me) setTimeout(() => tab.deliver(message), 0);
      },
      listen: (handler: (message: TabMessage) => void) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };
    tabs.add(me);
    return me;
  };
}

function world() {
  const locks = fakeLocks();
  const join = channel();
  const saved: SavedFile[][] = [];
  const tab = (options: { failWrites?: boolean; writable?: EditTarget['writable']; recovered?: number } = {}) => {
    const tabs = join();
    const notes: string[] = [];
    const timers: (() => void)[] = [];
    const editing = createEditing({
      locks,
      tabs,
      note: (text) => notes.push(text),
      after: (run, ms) => {
        expect(ms).toBe(HAND_OVER_MS);
        timers.push(run);
      },
    });
    let changed = 0;
    const target: EditTarget = {
      lockName: 'eb-editor:project:salvage-run',
      copy: workingCopy(memorySource({ 'project.json': MANIFEST })),
      write: async (files) => {
        if (options.failWrites) throw new Error('The disk is full.');
        saved.push(files);
      },
      recover: async () => options.recovered ?? 0,
      changed: () => changed++,
      ...(options.writable ? { writable: options.writable } : {}),
    };
    const rename = (to: string) =>
      editing.edit('Rename the project', async (copy) => {
        const change = await manifestChange(copy, 'name', to);
        return change ? [change] : [];
      });
    return {
      editing,
      tabs,
      notes,
      target,
      rename,
      changes: () => changed,
      timeUp: () => {
        for (const run of timers) run();
      },
    };
  };
  return { locks, saved, tab };
}

describe('one editing tab per project', () => {
  it('opens editable in the first tab and read only in the next', async () => {
    const { tab } = world();
    const a = tab();
    const b = tab();
    await a.editing.open(a.target);
    await b.editing.open(b.target);
    expect(a.editing.access.value.kind).toBe('editing');
    expect(b.editing.access.value.kind).toBe('elsewhere');
    expect(b.editing.session.value).toBeNull();
  });

  it('tells a read-only tab about each save, so it shows the files as saved', async () => {
    const { tab, saved } = world();
    const a = tab();
    const b = tab();
    await a.editing.open(a.target);
    await b.editing.open(b.target);
    const before = b.changes();
    await a.rename('Dirtbag');
    await a.editing.flush();
    await settle();
    expect(saved).toHaveLength(1);
    expect(b.changes()).toBe(before + 1);
  });

  it('hands editing over when asked: the editing tab saves first and goes read only', async () => {
    const { tab, saved } = world();
    const a = tab();
    const b = tab();
    await a.editing.open(a.target);
    await b.editing.open(b.target);
    await a.rename('Dirtbag');
    await b.editing.editHere();
    await settle();
    expect(saved.map((files) => files.map((f) => f.path))).toEqual([['project.json']]);
    expect(a.editing.access.value).toEqual({ kind: 'elsewhere', note: 'Editing moved to another tab.' });
    expect(b.editing.access.value.kind).toBe('editing');
    // Its own edits forgotten, the tab that let go reads its files again (here, as first stored).
    expect(a.target.copy.unsaved().size).toBe(0);
    expect(new TextDecoder().decode(await a.target.copy.read('project.json'))).toContain('"Salvage Run"');
  });

  it('keeps editing and says why when it can’t save before handing over', async () => {
    const { tab } = world();
    const a = tab({ failWrites: true });
    const b = tab();
    await a.editing.open(a.target);
    await b.editing.open(b.target);
    await a.rename('Dirtbag');
    void b.editing.editHere();
    await settle();
    expect(a.editing.access.value.kind).toBe('editing');
    expect(b.editing.access.value).toEqual({
      kind: 'elsewhere',
      note: 'The other tab couldn’t save its edits first: The disk is full.',
    });
  });

  it('offers to take over from a tab that doesn’t answer, and that tab stops saving', async () => {
    const { tab, saved } = world();
    const a = tab();
    const b = tab();
    await a.editing.open(a.target);
    await b.editing.open(b.target);
    a.tabs.frozen = true;
    void b.editing.editHere();
    await settle();
    expect(b.editing.access.value).toEqual({ kind: 'asking', slow: false });
    b.timeUp();
    expect(b.editing.access.value).toEqual({ kind: 'asking', slow: true });
    await b.editing.takeOver();
    await settle();
    expect(b.editing.access.value.kind).toBe('editing');
    expect(a.editing.access.value.kind).toBe('elsewhere');
    await a.rename('Too late');
    await a.editing.flush();
    expect(saved).toEqual([]);
  });

  it('lets the lock go on close, for the next tab to take', async () => {
    const { tab, locks } = world();
    const a = tab();
    await a.editing.open(a.target);
    await a.editing.close();
    expect(a.editing.access.value.kind).toBe('closed');
    expect(locks.held('eb-editor:project:salvage-run')).toBe(false);
  });

  it('waits for a tap before changing an opened folder', async () => {
    let allowed = false;
    const { tab } = world();
    const a = tab({ writable: { allowed: async () => allowed, ask: async () => (allowed = true) } });
    await a.editing.open(a.target);
    expect(a.editing.access.value.kind).toBe('ask-to-write');
    await a.editing.allowWriting();
    expect(a.editing.access.value.kind).toBe('editing');
  });

  it('finishes a save cut short before editing, and says so', async () => {
    const { tab } = world();
    const a = tab({ recovered: 2 });
    await a.editing.open(a.target);
    expect(a.notes).toContain('Finished a save that was cut short.');
  });

  it('notes undo and redo in the console', async () => {
    const { tab } = world();
    const a = tab();
    await a.editing.open(a.target);
    await a.rename('Dirtbag');
    await a.editing.undo();
    await a.editing.redo();
    expect(a.notes).toEqual(['Undone: Rename the project.', 'Redone: Rename the project.']);
  });
});

describe('a browser without Web Locks', () => {
  it('edits without the guard, and says so', async () => {
    const tabs = channel()();
    const notes: string[] = [];
    const editing = createEditing({ locks: null, tabs, note: (t) => notes.push(t), after: () => undefined });
    await editing.open({
      lockName: 'x',
      copy: workingCopy(memorySource({})),
      write: async () => undefined,
      changed: () => undefined,
    });
    expect(editing.access.value.kind).toBe('editing');
    expect(notes).toEqual(['This browser can’t stop two tabs editing one project at once.']);
  });
});
