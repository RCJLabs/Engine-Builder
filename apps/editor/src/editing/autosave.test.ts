import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { autosave, SAVE_AFTER_MS, type SaveState, type Timers } from './autosave.ts';
import type { SavedFile } from './journal.ts';
import { workingCopy } from './workingCopy.ts';

const text = (s: string) => new TextEncoder().encode(s);

/** Timers run by hand: `fire()` runs what is due, as if SAVE_AFTER_MS had passed. */
function handTimers() {
  const due = new Map<number, { run: () => void; ms: number }>();
  let next = 0;
  const timers: Timers = {
    set: (run, ms) => {
      due.set(++next, { run, ms });
      return next;
    },
    clear: (timer) => void due.delete(timer as number),
  };
  const fire = () => {
    const now = [...due.values()];
    due.clear();
    for (const { run } of now) run();
  };
  return { timers, fire, pending: () => [...due.values()].map((t) => t.ms) };
}

function setup(write: (files: SavedFile[]) => Promise<void> = async () => undefined) {
  const copy = workingCopy(memorySource({}));
  const states: SaveState['kind'][] = [];
  const clock = handTimers();
  const saver = autosave(copy, write, (state) => states.push(state.kind), clock.timers);
  const edit = (path: string, after: string) => {
    copy.apply([{ path, before: null, after: text(after) }], 'after');
    saver.touch();
  };
  return { copy, states, clock, saver, edit };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('autosave', () => {
  it('saves once, SAVE_AFTER_MS after the last of a burst of edits', async () => {
    const writes: string[][] = [];
    const { states, clock, edit } = setup(async (files) => void writes.push(files.map((f) => f.path)));
    edit('a.json', '1');
    edit('a.json', '2');
    edit('b.json', '3');
    expect(clock.pending()).toEqual([SAVE_AFTER_MS]);
    expect(writes).toEqual([]);
    clock.fire();
    await settle();
    expect(writes).toEqual([['a.json', 'b.json']]);
    expect(states).toEqual(['unsaved', 'unsaved', 'unsaved', 'saving', 'saved']);
  });

  it('saves at once when flushed, and leaves an edit made during a save for the next', async () => {
    let release: () => void = () => undefined;
    const writes: string[] = [];
    const { copy, clock, saver, edit } = setup(async (files) => {
      writes.push(files.map((f) => new TextDecoder().decode(f.bytes ?? new Uint8Array())).join());
      if (writes.length === 1) await new Promise<void>((resolve) => (release = resolve));
    });
    edit('a.json', '1');
    const first = saver.flush();
    expect(clock.pending()).toEqual([]);
    await settle();
    edit('a.json', '2');
    release();
    await first;
    expect(copy.unsaved().size).toBe(1);
    await saver.flush();
    expect(writes).toEqual(['1', '2']);
    expect(copy.unsaved().size).toBe(0);
  });

  it('reports a failed save, keeps the edits, and tries again on the next flush', async () => {
    let fail = true;
    const { copy, states, saver, edit } = setup(async () => {
      if (fail) throw new Error('The disk is full.');
    });
    edit('a.json', '1');
    await expect(saver.flush()).rejects.toThrow('The disk is full.');
    expect(states.at(-1)).toBe('failed');
    expect(copy.unsaved().size).toBe(1);
    fail = false;
    await saver.flush();
    expect(states.at(-1)).toBe('saved');
    expect(copy.unsaved().size).toBe(0);
  });

  it('writes nothing when nothing is unsaved, and stop drops the timer', async () => {
    const writes: number[] = [];
    const { clock, saver, edit } = setup(async (files) => void writes.push(files.length));
    await saver.flush();
    edit('a.json', '1');
    saver.stop();
    expect(clock.pending()).toEqual([]);
    expect(writes).toEqual([]);
  });
});
