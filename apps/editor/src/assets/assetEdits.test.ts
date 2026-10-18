import { compileProject, memorySource, type ProjectSource } from '@eb/compiler';
import type { Provenance } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import type { Timers } from '../editing/autosave.ts';
import { editSession } from '../editing/editSession.ts';
import type { FileChange } from '../editing/history.ts';
import { workingCopy } from '../editing/workingCopy.ts';
import { createStandIn, deleteAssets, importAssets, renameAsset, replaceAsset, setProvenance } from './assetEdits.ts';

const noTimers: Timers = { set: () => 0, clear: () => undefined };
const decode = (bytes: Uint8Array | undefined) => (bytes ? new TextDecoder().decode(bytes) : undefined);
const bytes = (...values: number[]) => new Uint8Array(values);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47);
const CC0: Provenance = { licence: 'CC0-1.0', source: 'https://kenney.nl', date: '2026-10-18' };

function setup(files: Record<string, string | Uint8Array> = readFixture(FIXTURE_LUDUS)) {
  const reads: string[] = [];
  const base = memorySource(files);
  const counted: ProjectSource = {
    files: base.files,
    read: (path) => {
      reads.push(path);
      return base.read(path);
    },
  };
  const copy = workingCopy(counted);
  const session = editSession({ copy, write: async () => undefined, timers: noTimers });
  const all = async () => {
    const out: Record<string, string> = {};
    for (const path of [...(await copy.files(''))].sort()) out[path] = decode(await copy.read(path)) ?? '';
    return out;
  };
  const json = async (path: string) => JSON.parse(decode(await copy.read(path)) ?? 'null');
  const problems = async () =>
    (await compileProject(copy, [])).diagnostics.map((d) => `${d.code} ${d.file}${d.path ? `#${d.path}` : ''}`);
  const step = (make: (c: typeof copy) => Promise<readonly FileChange[]>) => session.edit('step', make);
  const undoAll = async () => {
    while (await session.undo());
  };
  return { copy, session, all, json, problems, step, undoAll, reads };
}

const paths = (changes: readonly FileChange[]) =>
  changes.map((c) => `${c.before === null ? '+' : c.after === null ? '-' : '~'}${c.path}`);

describe('import', () => {
  it('writes the files and their entries as one step, which undo takes back whole', async () => {
    const t = setup();
    const before = await t.all();
    const changes = await importAssets(
      t.copy,
      [
        { path: 'ui/button.png', bytes: PNG },
        { path: 'audio/theme.ogg', bytes: bytes(1, 2) },
      ],
      CC0,
    );
    expect(paths(changes)).toEqual(['+assets/ui/button.png', '+assets/audio/theme.ogg', '~assets/assets.json']);
    await t.step(async () => changes);
    expect(await t.problems()).toEqual([]);
    expect(Object.keys((await t.json('assets/assets.json')).files)).toEqual([
      'audio/theme.ogg',
      'portraits/spiculus.svg',
      'ui/button.png',
    ]);
    expect(await t.copy.read('assets/ui/button.png')).toEqual(PNG);
    await t.undoAll();
    expect(await t.all()).toEqual(before);
  });

  it('starts the log when a project has none', async () => {
    const files = readFixture(FIXTURE_LUDUS);
    delete files['assets/assets.json'];
    const t = setup(files);
    expect(await t.problems()).toEqual(['E019 assets/portraits/spiculus.svg']);
    await t.step((c) => importAssets(c, [{ path: 'portraits/spiculus-2.svg', bytes: PNG }], CC0));
    expect(await t.json('assets/assets.json')).toEqual({ files: { 'portraits/spiculus-2.svg': CC0 } });
    expect(await t.problems()).toEqual(['E019 assets/portraits/spiculus.svg']);
  });

  it('never writes over a file, whatever its case, nor takes the log’s name or a path the format refuses', async () => {
    const { copy } = setup();
    const one = (path: string) => importAssets(copy, [{ path, bytes: PNG }], CC0);
    await expect(one('portraits/spiculus.svg')).rejects.toThrow('assets/portraits/spiculus.svg is there already');
    await expect(one('Portraits/SPICULUS.svg')).rejects.toThrow('is there already');
    await expect(one('assets.json')).rejects.toThrow('assets/assets.json is the provenance log');
    await expect(one('a:b.png')).rejects.toThrow('isn’t a path inside assets/ the format takes');
    await expect(one('.hidden.png')).rejects.toThrow('the format takes');
    const twice = importAssets(
      copy,
      [
        { path: 'ui/a.png', bytes: PNG },
        { path: 'UI/A.png', bytes: PNG },
      ],
      CC0,
    );
    await expect(twice).rejects.toThrow('assets/UI/A.png is there already');
  });

  it('refuses to change a log that isn’t JSON, and changes nothing', async () => {
    const t = setup({ ...readFixture(FIXTURE_LUDUS), 'assets/assets.json': '{ "files": ' });
    await expect(importAssets(t.copy, [{ path: 'ui/a.png', bytes: PNG }], CC0)).rejects.toThrow(
      'assets/assets.json isn’t JSON: fix it first',
    );
  });
});

describe('provenance', () => {
  it('sets a key where the format lists it, keeps the file’s layout, and takes a key out', async () => {
    const t = setup();
    await t.step((c) => setProvenance(c, ['files', 'portraits/spiculus.svg', 'author'], 'Evan'));
    const entry = (await t.json('assets/assets.json')).files['portraits/spiculus.svg'];
    expect(Object.keys(entry)).toEqual(['licence', 'author', 'source', 'date']);
    const text = decode(await t.copy.read('assets/assets.json')) ?? '';
    expect(text).toContain('      "author": "Evan",\n');
    await t.step((c) => setProvenance(c, ['files', 'portraits/spiculus.svg', 'author'], undefined));
    expect(decode(await t.copy.read('assets/assets.json'))).toBe(readFixture(FIXTURE_LUDUS)['assets/assets.json']);
  });

  it('shows the licence check’s problem as soon as it is written', async () => {
    const t = setup();
    await t.step((c) => setProvenance(c, ['files', 'portraits/spiculus.svg', 'licence'], 'CC-BY-NC-4.0'));
    expect(await t.problems()).toEqual(['E020 assets/assets.json#/files/portraits~1spiculus.svg/licence']);
  });
});

describe('rename', () => {
  it('moves the file and its entry, and every record that names it follows; undo gives every byte back', async () => {
    const t = setup();
    const before = await t.all();
    const changes = await renameAsset(t.copy, 'portraits/spiculus.svg', 'heroes/spiculus.svg');
    expect(paths(changes)).toEqual([
      '-assets/portraits/spiculus.svg',
      '+assets/heroes/spiculus.svg',
      '~assets/assets.json',
      '~records/gladiator/spiculus.json',
    ]);
    await t.step(async () => changes);
    expect(await t.problems()).toEqual([]);
    expect(await t.copy.read('assets/heroes/spiculus.svg')).toEqual(
      new TextEncoder().encode(before['assets/portraits/spiculus.svg']),
    );
    expect((await t.json('records/gladiator/spiculus.json')).portrait).toBe('heroes/spiculus.svg');
    expect(Object.keys((await t.json('assets/assets.json')).files)).toEqual(['heroes/spiculus.svg']);
    await t.undoAll();
    expect(await t.all()).toEqual(before);
  });

  it('reads no record of a type with no asset fields', async () => {
    const t = setup();
    await renameAsset(t.copy, 'portraits/spiculus.svg', 'heroes/spiculus.svg');
    expect(t.reads.filter((path) => path.startsWith('records/school/') || path.startsWith('records/weapon/'))).toEqual(
      [],
    );
    expect(t.reads).toContain('records/gladiator/flamma.json');
  });

  it('refuses a name that is taken, and a change of case alone', async () => {
    const t = setup();
    await t.step((c) => importAssets(c, [{ path: 'portraits/flamma.png', bytes: PNG }], CC0));
    await expect(renameAsset(t.copy, 'portraits/flamma.png', 'portraits/Spiculus.svg')).rejects.toThrow(
      'is there already',
    );
    await expect(renameAsset(t.copy, 'portraits/flamma.png', 'portraits/Flamma.png')).rejects.toThrow(
      'Only its case changes',
    );
    expect(await renameAsset(t.copy, 'portraits/flamma.png', 'portraits/flamma.png')).toEqual([]);
    expect(await renameAsset(t.copy, 'portraits/gone.png', 'portraits/x.png')).toEqual([]);
  });
});

describe('delete', () => {
  it('takes the files and their entries, and leaves the records that named them to show E018', async () => {
    const t = setup();
    const before = await t.all();
    await t.step((c) => deleteAssets(c, ['portraits/spiculus.svg']));
    expect(await t.copy.read('assets/portraits/spiculus.svg')).toBeUndefined();
    expect((await t.json('assets/assets.json')).files).toEqual({});
    expect(await t.problems()).toEqual(['E018 records/gladiator/spiculus.json#/portrait']);
    await t.undoAll();
    expect(await t.all()).toEqual(before);
  });
});

describe('stand-ins and replacing', () => {
  it('makes a stand-in that W107 lists, and real art over it ends the warning', async () => {
    const t = setup();
    await t.step((c) => createStandIn(c, 'stand-ins/flamma.svg', 'Flamma', '2026-10-18'));
    expect(await t.problems()).toEqual(['W107 assets/stand-ins/flamma.svg']);
    expect(decode(await t.copy.read('assets/stand-ins/flamma.svg'))).toContain('>Flamma<');
    expect((await t.json('assets/assets.json')).files['stand-ins/flamma.svg']).toEqual({
      licence: 'own',
      source: 'A stand-in the editor made',
      date: '2026-10-18',
      standIn: true,
    });
    await t.step((c) => replaceAsset(c, 'stand-ins/flamma.svg', PNG, CC0, 'stand-ins/flamma.png'));
    expect(await t.problems()).toEqual([]);
    expect(await t.copy.read('assets/stand-ins/flamma.svg')).toBeUndefined();
    expect((await t.json('assets/assets.json')).files['stand-ins/flamma.png']).toEqual(CC0);
  });

  it('keeps the path when the kind of file stays, and moves every record with it when it changes', async () => {
    const t = setup();
    const before = await t.all();
    const same = await replaceAsset(t.copy, 'portraits/spiculus.svg', PNG, CC0);
    expect(paths(same)).toEqual(['~assets/portraits/spiculus.svg', '~assets/assets.json']);
    const moved = await replaceAsset(t.copy, 'portraits/spiculus.svg', PNG, CC0, 'portraits/spiculus.png');
    expect(paths(moved)).toEqual([
      '-assets/portraits/spiculus.svg',
      '+assets/portraits/spiculus.png',
      '~assets/assets.json',
      '~records/gladiator/spiculus.json',
    ]);
    await t.step(async () => moved);
    expect(await t.problems()).toEqual([]);
    expect((await t.json('records/gladiator/spiculus.json')).portrait).toBe('portraits/spiculus.png');
    await t.undoAll();
    expect(await t.all()).toEqual(before);
  });
});
