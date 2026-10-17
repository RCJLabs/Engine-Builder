import { memorySource } from '@eb/compiler';
import type { TypeFile } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import type { Timers } from '../editing/autosave.ts';
import { editSession } from '../editing/editSession.ts';
import { workingCopy } from '../editing/workingCopy.ts';
import { changeRecord, createRecordFile, deleteRecordFile, loadRecord, newFileText } from './recordEdits.ts';
import { newRecord, setIn } from './values.ts';

const BOM = String.fromCharCode(0xfeff);
const FILE = 'records/gladiator/spiculus.json';
// Written by hand on Windows: a byte order mark, CRLF, tabs, keys in no particular order.
const SPICULUS = `${BOM}{\r\n\t"might": 72,\r\n\t"name": "Spiculus",\r\n\t"skills": [\r\n\t\t"feint"\r\n\t]\r\n}\r\n`;
const gladiator: TypeFile = {
  title: 'Gladiator',
  fields: {
    name: { kind: 'text' },
    title: { kind: 'text', optional: true },
    might: { kind: 'int' },
    skills: { kind: 'list', of: { kind: 'text' } },
  },
};
const noTimers: Timers = { set: () => 0, clear: () => undefined };
const text = (bytes: Uint8Array | undefined) =>
  bytes ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) : undefined;

function setup(files: Record<string, string> = { [FILE]: SPICULUS }) {
  const copy = workingCopy(memorySource(files));
  let clock = 0;
  const session = editSession({ copy, write: async () => undefined, now: () => clock, timers: noTimers });
  /** A form's set(): the record changed at one path, grouped by field, as RecordForm does. */
  const set = (path: (string | number)[], next: unknown, at: number) => {
    clock = at;
    return session.edit(
      'Edit',
      (c) => changeRecord(c, FILE, (now) => setIn(now, path, next, gladiator)),
      `${FILE}#/${path.join('/')}`,
    );
  };
  return { copy, session, set };
}

describe('changeRecord', () => {
  it('writes the record back in its own layout, changing one line', async () => {
    const { copy, set } = setup();
    await set(['might'], 80, 0);
    expect(text(await copy.read(FILE))).toBe(SPICULUS.replace('"might": 72', '"might": 80'));
  });

  it('puts a new field where the type lists it, and takes it out again when emptied', async () => {
    const { copy, set } = setup();
    await set(['title'], 'the Great', 0);
    expect(text(await copy.read(FILE))).toBe(
      SPICULUS.replace('"name": "Spiculus",\r\n', '"name": "Spiculus",\r\n\t"title": "the Great",\r\n'),
    );
    await set(['title'], undefined, 1000);
    expect(text(await copy.read(FILE))).toBe(SPICULUS);
  });

  it('joins typing in one field into one step, which undo takes back to the very bytes', async () => {
    const { copy, session, set } = setup();
    for (const [i, typed] of ['S', 'Sp', 'Spi'].entries()) await set(['name'], typed, i * 100);
    await set(['might'], 1, 300);
    expect(session.history.value.past.map((step) => step.group)).toEqual([`${FILE}#/name`, `${FILE}#/might`]);
    await session.undo();
    await session.undo();
    expect(text(await copy.read(FILE))).toBe(SPICULUS);
  });

  it('makes no change, and no step, for a value already there', async () => {
    const { session, set } = setup();
    await set(['might'], 72, 0);
    expect(session.history.value.past).toEqual([]);
  });
});

describe('creating and deleting records', () => {
  it('creates a record as two-space JSON with the type’s required fields, and never over one', async () => {
    const { copy, session } = setup({});
    await session.edit('New', (c) => createRecordFile(c, FILE, newRecord(gladiator)));
    expect(text(await copy.read(FILE))).toBe('{\n  "name": "",\n  "might": 0,\n  "skills": []\n}\n');
    expect(newFileText({ a: 1 })).toBe('{\n  "a": 1\n}\n');
    await expect(createRecordFile(copy, FILE, {})).rejects.toThrow(`${FILE} exists already`);
  });

  it('deletes a record as a step undo brings back', async () => {
    const { copy, session } = setup();
    await session.edit('Delete', (c) => deleteRecordFile(c, FILE));
    expect(await copy.read(FILE)).toBeUndefined();
    expect(await deleteRecordFile(copy, FILE)).toEqual([]);
    await session.undo();
    expect(text(await copy.read(FILE))).toBe(SPICULUS);
  });
});

describe('loadRecord', () => {
  it('says whether a record is there, unreadable, or read', async () => {
    const source = memorySource({ [FILE]: SPICULUS, 'records/gladiator/torn.json': '{ "name": ' });
    expect(await loadRecord(source, FILE)).toEqual({
      kind: 'ok',
      value: { might: 72, name: 'Spiculus', skills: ['feint'] },
    });
    expect(await loadRecord(source, 'records/gladiator/none.json')).toEqual({ kind: 'missing' });
    expect((await loadRecord(source, 'records/gladiator/torn.json')).kind).toBe('unreadable');
  });
});
