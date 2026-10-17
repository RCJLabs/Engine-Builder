import { memorySource } from '@eb/compiler';
import type { TypeFile } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import type { Timers } from '../editing/autosave.ts';
import { editSession } from '../editing/editSession.ts';
import { workingCopy } from '../editing/workingCopy.ts';
import {
  changeRecord,
  changeRecords,
  createRecordFile,
  deleteRecordFile,
  deleteRecordFiles,
  duplicateRecordFile,
  loadRecord,
  newFileText,
} from './recordEdits.ts';
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

describe('changing, copying and deleting many records', () => {
  const PRISCUS = 'records/gladiator/priscus.json';
  const TWO = { [FILE]: SPICULUS, [PRISCUS]: '{\n  "name": "Priscus",\n  "might": 72\n}\n' };

  it('changes many records as one step, each in its own layout, and undo takes all back', async () => {
    const { copy, session } = setup(TWO);
    await session.edit('Set might', (c) =>
      changeRecords(c, [FILE, PRISCUS, 'records/gladiator/gone.json'], (v) => setIn(v, ['might'], 90, gladiator)),
    );
    expect(text(await copy.read(FILE))).toBe(SPICULUS.replace('"might": 72', '"might": 90'));
    expect(text(await copy.read(PRISCUS))).toBe('{\n  "name": "Priscus",\n  "might": 90\n}\n');
    expect(session.history.value.past).toHaveLength(1);
    await session.undo();
    expect(text(await copy.read(FILE))).toBe(SPICULUS);
    expect(text(await copy.read(PRISCUS))).toBe(TWO[PRISCUS]);
  });

  it('leaves out records the change leaves as they were', async () => {
    const { copy } = setup(TWO);
    const changes = await changeRecords(copy, [FILE, PRISCUS], (v) => setIn(v, ['name'], 'Priscus', gladiator));
    expect(changes.map((c) => c.path)).toEqual([FILE]);
  });

  it('deletes many as one step, passing over those already gone', async () => {
    const { copy, session } = setup(TWO);
    await session.edit('Delete', (c) => deleteRecordFiles(c, [FILE, 'records/gladiator/gone.json', PRISCUS]));
    expect(await copy.read(FILE)).toBeUndefined();
    expect(await copy.read(PRISCUS)).toBeUndefined();
    await session.undo();
    expect(text(await copy.read(PRISCUS))).toBe(TWO[PRISCUS]);
  });

  it('copies a record byte for byte, or with its new name in its own layout, and never over one', async () => {
    const { copy, session } = setup(TWO);
    const COPY = 'records/gladiator/spiculus-2.json';
    await session.edit('Duplicate', (c) => duplicateRecordFile(c, FILE, COPY));
    expect(await copy.read(COPY)).toEqual(await copy.read(FILE));
    const NAMED = 'records/gladiator/spiculus-3.json';
    await session.edit('Duplicate', (c) =>
      duplicateRecordFile(c, FILE, NAMED, (v) => setIn(v, ['name'], 'Spiculus III', gladiator)),
    );
    expect(text(await copy.read(NAMED))).toBe(SPICULUS.replace('"Spiculus"', '"Spiculus III"'));
    await expect(duplicateRecordFile(copy, FILE, PRISCUS)).rejects.toThrow(`${PRISCUS} exists already`);
    expect(await duplicateRecordFile(copy, 'records/gladiator/gone.json', COPY)).toEqual([]);
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
