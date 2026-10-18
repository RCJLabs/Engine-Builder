import { beforeEach, describe, expect, it } from 'vitest';
import { lastError, log, note, noteError } from './state.ts';

beforeEach(() => {
  log.value = [];
  lastError.value = null;
});

const said = () => log.value.map((line) => `${line.level} ${line.text} ×${line.count}`);

describe('the console log (M2.8)', () => {
  it('counts a line said again in a row rather than repeating it', () => {
    note('Saved.');
    note('Saved.');
    note('Opened Ludus.');
    note('Saved.');
    expect(said()).toEqual(['info Saved. ×2', 'info Opened Ludus. ×1', 'info Saved. ×1']);
  });

  it('keeps an error apart from the same words said as information', () => {
    note('The folder is gone.');
    noteError('The folder is gone.');
    expect(said()).toEqual(['info The folder is gone. ×1', 'error The folder is gone. ×1']);
  });

  it('keeps a line its id when it is said again, and gives a new line its own', () => {
    note('Saved.');
    const [first] = log.value;
    note('Saved.');
    note('Opened.');
    expect(log.value[0]?.id).toBe(first?.id);
    expect(log.value[1]?.id).not.toBe(first?.id);
  });

  it('keeps the newest 200 lines', () => {
    for (let i = 0; i < 250; i++) note(`Line ${i}.`);
    expect(log.value).toHaveLength(200);
    expect(log.value[0]?.text).toBe('Line 50.');
    expect(log.value.at(-1)?.text).toBe('Line 249.');
  });

  it('holds the last error for the toast, and nothing else', () => {
    note('Opened Ludus.');
    expect(lastError.value).toBeNull();
    noteError('Couldn’t save.');
    expect(lastError.value?.text).toBe('Couldn’t save.');
    noteError('Couldn’t save.');
    expect(lastError.value?.count).toBe(2);
    note('Saved.');
    expect(lastError.value?.text).toBe('Couldn’t save.');
  });
});
