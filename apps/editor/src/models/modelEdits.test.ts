/**
 * An import with a model in it, as one step (M5.5, D67): the GLB, its provenance with the packing
 * among its edits, and its model record, which the compiler then finds nothing wrong with; undo
 * takes all of it back, and a record that is there already stops the step whole.
 */
import { compileProject, memorySource } from '@eb/compiler';
import { packModel } from '@eb/models/pack';
import type { Provenance } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { crateModel, dracoDecoder, glbOf } from '../../../../packages/models/test/shapes.ts';
import type { Timers } from '../editing/autosave.ts';
import { editSession } from '../editing/editSession.ts';
import { workingCopy } from '../editing/workingCopy.ts';
import { importModels, PACKED_EDIT } from './modelEdits.ts';
import { modelRecordOf } from './modelImport.ts';

const noTimers: Timers = { set: () => 0, clear: () => undefined };
const CC0: Provenance = { licence: 'CC0-1.0', source: 'https://kenney.nl', date: '2026-10-24', edits: ['Recoloured'] };
const box = { shape: 'box', center: [0, 0.75, 0], size: [1, 1.5, 1] } as const;

async function setup() {
  const copy = workingCopy(memorySource(readFixture(FIXTURE_LUDUS)));
  const session = editSession({ copy, write: async () => undefined, timers: noTimers });
  const text = async (path: string) => {
    const bytes = await copy.read(path);
    return bytes ? new TextDecoder().decode(bytes) : undefined;
  };
  const glb = await packModel({ name: 'crate.glb', bytes: await glbOf(crateModel()) }, [], {
    draco: await dracoDecoder(),
  });
  return { copy, session, text, glb };
}

describe('importing a model', () => {
  it('writes its GLB, its entry with the packing added, and its record, which compile clean', async () => {
    const t = await setup();
    const before = (await compileProject(t.copy, [])).diagnostics;
    const record = modelRecordOf('crate.glb', 'models/crate.glb', { triangles: 24, collider: box }, new Set());
    const icon = {
      path: 'images/icon.svg',
      bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    };
    await t.session.edit('import', (copy) =>
      importModels(copy, [icon], [{ path: 'models/crate.glb', bytes: t.glb, record }], CC0),
    );
    expect(await t.copy.read('assets/models/crate.glb')).toEqual(t.glb);
    const log = JSON.parse((await t.text('assets/assets.json')) ?? '{}');
    expect(log.files['models/crate.glb'].edits).toEqual(['Recoloured', PACKED_EDIT]);
    expect(log.files['images/icon.svg'].edits).toEqual(['Recoloured']);
    expect(JSON.parse((await t.text('records/model/crate.json')) ?? 'null')).toEqual({
      name: 'crate',
      file: 'models/crate.glb',
      collider: box,
    });
    expect((await compileProject(t.copy, [])).diagnostics).toEqual(before);
  });

  it('is taken back whole by one undo', async () => {
    const t = await setup();
    const record = modelRecordOf('crate.glb', 'models/crate.glb', { triangles: 24, collider: box }, new Set());
    const logBefore = await t.text('assets/assets.json');
    await t.session.edit('import', (copy) =>
      importModels(copy, [], [{ path: 'models/crate.glb', bytes: t.glb, record }], CC0),
    );
    await t.session.undo();
    expect(await t.copy.read('assets/models/crate.glb')).toBeUndefined();
    expect(await t.copy.read('records/model/crate.json')).toBeUndefined();
    expect(await t.text('assets/assets.json')).toBe(logBefore);
  });

  it('leaves the record out when Make a model isn’t ticked', async () => {
    const t = await setup();
    await t.session.edit('import', (copy) =>
      importModels(copy, [], [{ path: 'models/crate.glb', bytes: t.glb, record: null }], CC0),
    );
    expect(await t.copy.files('records/model')).toEqual([]);
  });

  it('writes nothing when a record of that id is there already', async () => {
    const t = await setup();
    await t.session.edit('first', async () => [
      { path: 'records/model/crate.json', before: null, after: new TextEncoder().encode('{"file":"x.glb"}\n') },
    ]);
    const record = modelRecordOf('crate.glb', 'models/crate.glb', { triangles: 24, collider: box }, new Set());
    await expect(
      t.session.edit('import', (copy) =>
        importModels(copy, [], [{ path: 'models/crate.glb', bytes: t.glb, record }], CC0),
      ),
    ).rejects.toThrow('records/model/crate.json exists already');
    expect(await t.copy.read('assets/models/crate.glb')).toBeUndefined();
  });
});
