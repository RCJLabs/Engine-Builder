import { describe, expect, it } from 'vitest';
import { emptyHistory, type History, type HistoryLimits, record, redo, type Step, sameState, undo } from './history.ts';

const LIMITS: HistoryLimits = { groupMs: 500, depth: 3 };
const text = (s: string) => new TextEncoder().encode(s);
const state = (bytes: Uint8Array | null) => (bytes === null ? null : new TextDecoder().decode(bytes));

/** A step that sets `path` from `before` to `after`. */
const step = (at: number, before: string | null, after: string | null, group?: string, path = 'a.json'): Step => ({
  label: `set ${after}`,
  changes: [{ path, before: before === null ? null : text(before), after: after === null ? null : text(after) }],
  at,
  ...(group ? { group } : {}),
});
const afters = (history: History) => history.past.map((s) => s.changes.map((c) => state(c.after)).join(','));

describe('record', () => {
  it('keeps each step, newest last, and drops redo', () => {
    let history = record(emptyHistory(), step(0, '1', '2'), LIMITS);
    history = record(history, step(10, '2', '3'), LIMITS);
    const back = undo(history);
    expect(back && afters(back.history)).toEqual(['2']);
    const after = record(back?.history ?? history, step(20, '2', '4'), LIMITS);
    expect(afters(after)).toEqual(['2', '4']);
    expect(after.future).toEqual([]);
  });

  it('joins steps of one group made within the delay, keeping the first before and the label', () => {
    let history = record(emptyHistory(), step(0, 'a', 'ab', 'name'), LIMITS);
    history = record(history, { ...step(400, 'ab', 'abc', 'name'), label: 'later' }, LIMITS);
    expect(history.past).toHaveLength(1);
    expect(history.past[0]?.label).toBe('set ab');
    expect(state(history.past[0]?.changes[0]?.before ?? null)).toBe('a');
    expect(state(history.past[0]?.changes[0]?.after ?? null)).toBe('abc');
    // The delay counts from the last keystroke, so steady typing stays one step.
    history = record(history, step(850, 'abc', 'abcd', 'name'), LIMITS);
    expect(history.past).toHaveLength(1);
  });

  it('starts a new step after the delay, in another group, without a group, or after an undo', () => {
    const first = record(emptyHistory(), step(0, 'a', 'b', 'name'), LIMITS);
    expect(record(first, step(501, 'b', 'c', 'name'), LIMITS).past).toHaveLength(2);
    expect(record(first, step(10, 'b', 'c', 'version'), LIMITS).past).toHaveLength(2);
    expect(record(first, step(10, 'b', 'c'), LIMITS).past).toHaveLength(2);
    const two = record(first, step(600, 'b', 'c', 'name'), LIMITS);
    const back = undo(two);
    expect(back && record(back.history, step(610, 'b', 'x', 'name'), LIMITS).past).toHaveLength(2);
  });

  it('drops a step that leaves every file as it was, such as typing a name back', () => {
    let history = record(emptyHistory(), step(0, 'a', 'ab', 'name'), LIMITS);
    history = record(history, step(100, 'ab', 'a', 'name'), LIMITS);
    expect(history.past).toEqual([]);
  });

  it('folds steps that touch different files into one, file by file', () => {
    let history = record(emptyHistory(), step(0, '1', '2', 'g', 'a.json'), LIMITS);
    history = record(history, step(10, null, 'new', 'g', 'b.json'), LIMITS);
    expect(history.past[0]?.changes.map((c) => [c.path, state(c.before), state(c.after)])).toEqual([
      ['a.json', '1', '2'],
      ['b.json', null, 'new'],
    ]);
  });

  it('keeps only the newest steps up to the depth', () => {
    let history = emptyHistory();
    for (let i = 0; i < 5; i++) history = record(history, step(i * 1000, String(i), String(i + 1)), LIMITS);
    expect(afters(history)).toEqual(['3', '4', '5']);
  });
});

describe('undo and redo', () => {
  it('walk the steps back and forth, and stop at the ends', () => {
    let history = record(emptyHistory(), step(0, '1', '2'), LIMITS);
    history = record(history, step(1000, '2', '3'), LIMITS);
    const one = undo(history);
    expect(one && state(one.step.changes[0]?.before ?? null)).toBe('2');
    const two = one && undo(one.history);
    expect(two && state(two.step.changes[0]?.before ?? null)).toBe('1');
    expect(two && undo(two.history)).toBeNull();
    const again = two && redo(two.history);
    expect(again && state(again.step.changes[0]?.after ?? null)).toBe('2');
    expect(redo(history)).toBeNull();
  });
});

describe('sameState', () => {
  it('compares bytes, and no file only with no file', () => {
    expect(sameState(text('ab'), text('ab'))).toBe(true);
    expect(sameState(text('ab'), text('ac'))).toBe(false);
    expect(sameState(text('a'), text('ab'))).toBe(false);
    expect(sameState(null, null)).toBe(true);
    expect(sameState(null, text(''))).toBe(false);
  });
});
