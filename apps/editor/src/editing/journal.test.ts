import { afterEach, describe, expect, it } from 'vitest';
import { MemoryDirectory, PowerCut, power, restorePower } from '../../test/memory-fs.ts';
import { JOURNAL, journalText, readJournal, recoverJournal, type SavedFile, saveFiles } from './journal.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const BASE = ['projects', 'salvage-run'];

const OLD = {
  'projects/salvage-run/project.json': '{"name":"Old"}',
  'projects/salvage-run/records/item/medkit.json': '{"heal":5}',
  'projects/salvage-run/records/item/bandage.json': '{"heal":1}',
};
// Every kind of change at once: a longer file, a shorter one, a new one and a removal.
const SAVE: SavedFile[] = [
  { path: 'project.json', bytes: bytes('{"name":"A much longer new name"}') },
  { path: 'records/item/medkit.json', bytes: bytes('{}') },
  { path: 'records/actor/rook.json', bytes: bytes('{"name":"Rook"}') },
  { path: 'records/item/bandage.json', bytes: null },
];
const NEW = {
  'projects/salvage-run/project.json': '{"name":"A much longer new name"}',
  'projects/salvage-run/records/item/medkit.json': '{}',
  'projects/salvage-run/records/actor/rook.json': '{"name":"Rook"}',
};

const contents = (root: MemoryDirectory) =>
  Object.fromEntries(Object.entries(root.files()).map(([path, data]) => [path, new TextDecoder().decode(data)]));
const sorted = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).sort());

afterEach(restorePower);

/** Bytes that don't repeat: a xorshift stream from `seed`. */
function noise(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size);
  let x = seed;
  for (let i = 0; i < size; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

describe('journalText and readJournal', () => {
  it('write base64 as one pass over the file would, at every size around the parts it is built in', () => {
    // The parts are 3 × 65,536 bytes, built from slices of 8,192: either side of each, and several parts.
    for (const size of [0, 1, 2, 3, 4, 8191, 8192, 8193, 196607, 196608, 196609, 393217, 1_000_003]) {
      const file = noise(size, size + 1);
      const [body] = journalText([{ path: 'a.bin', bytes: file }]).split('\n');
      const written = (JSON.parse(body as string) as { files: { bytes: string }[] }).files[0]?.bytes;
      expect(written, `${size} bytes`).toBe(Buffer.from(file).toString('base64'));
      const back = readJournal(journalText([{ path: 'a.bin', bytes: file }]))?.[0]?.bytes;
      // Compared as buffers: an element-by-element deep equal of a megabyte takes seconds.
      expect(back && Buffer.from(back).equals(Buffer.from(file)), `${size} bytes`).toBe(true);
    }
  });

  it('carry every byte value and removals', () => {
    const files: SavedFile[] = [
      { path: 'assets/all.bin', bytes: Uint8Array.from({ length: 256 }, (_, i) => i) },
      { path: 'records/item/gone.json', bytes: null },
    ];
    expect(readJournal(journalText(files))).toEqual(files);
  });

  it('read a journal cut short at any length as torn', () => {
    const text = journalText(SAVE);
    for (let length = 0; length < text.length; length++)
      expect(readJournal(text.slice(0, length)), `${length}`).toBeNull();
    expect(readJournal(text)).not.toBeNull();
  });

  it('read a changed byte, extra text or something else entirely as torn', () => {
    const text = journalText(SAVE);
    // Inside a file's base64 the JSON stays valid, so only the hash can tell.
    const at = text.indexOf('"bytes":"') + '"bytes":"'.length;
    const flipped = `${text.slice(0, at)}${text[at] === 'A' ? 'B' : 'A'}${text.slice(at + 1)}`;
    expect(JSON.parse(flipped.split('\n')[0] as string)).toBeTruthy();
    expect(readJournal(flipped)).toBeNull();
    expect(readJournal(`${text}more\n`)).toBeNull();
    expect(readJournal('{"journal":2,"files":[]}\n')).toBeNull();
  });
});

describe('saveFiles', () => {
  it('writes, adds and removes the files, and leaves no journal', async () => {
    const root = MemoryDirectory.of(OLD);
    await saveFiles(root, BASE, SAVE);
    expect(sorted(contents(root))).toEqual(sorted(NEW));
  });

  it('leaves every file old or every file new, wherever the power is cut', async () => {
    const whole = MemoryDirectory.of(OLD);
    await saveFiles(whole, BASE, SAVE);
    const steps = power.spent;
    const outcomes = { old: 0, new: 0 };
    for (let cut = 0; cut <= steps; cut++) {
      restorePower();
      const root = MemoryDirectory.of(OLD);
      power.budget = cut;
      const saved = await saveFiles(root, BASE, SAVE).then(
        () => true,
        (error: unknown) => {
          if (!(error instanceof PowerCut)) throw error;
          return false;
        },
      );
      expect(saved, `cut ${cut} of ${steps}`).toBe(cut === steps);
      restorePower();
      await recoverJournal(root, BASE);
      const after = sorted(contents(root));
      const which = JSON.stringify(after) === JSON.stringify(sorted(OLD)) ? 'old' : 'new';
      expect(after, `cut ${cut} of ${steps}`).toEqual(sorted(which === 'old' ? OLD : NEW));
      outcomes[which]++;
    }
    // Both ends are reached: cuts before the journal is whole lose the save, later ones finish it.
    expect(outcomes.old).toBeGreaterThan(0);
    expect(outcomes.new).toBeGreaterThan(0);
  });
});

describe('recoverJournal', () => {
  it('does nothing without a journal, or without the project', async () => {
    const root = MemoryDirectory.of(OLD);
    expect(await recoverJournal(root, BASE)).toBe(0);
    expect(await recoverJournal(root, ['projects', 'gone'])).toBe(0);
    expect(contents(root)).toEqual(OLD);
  });

  it('finishes a whole journal and drops a torn one', async () => {
    const whole = MemoryDirectory.of({ ...OLD, [`projects/salvage-run/${JOURNAL}`]: journalText(SAVE) });
    expect(await recoverJournal(whole, BASE)).toBe(4);
    expect(sorted(contents(whole))).toEqual(sorted(NEW));

    const text = journalText(SAVE);
    const torn = MemoryDirectory.of({ ...OLD, [`projects/salvage-run/${JOURNAL}`]: text.slice(0, text.length - 5) });
    expect(await recoverJournal(torn, BASE)).toBe(0);
    expect(contents(torn)).toEqual(OLD);
  });
});
