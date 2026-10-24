/**
 * Add starter kit (M5.5, D67): the committed kit added to a project as one step that undo takes
 * back, the project then as sound as before, and a second press adding only what is missing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import type { Timers } from '../editing/autosave.ts';
import { editSession } from '../editing/editSession.ts';
import { workingCopy } from '../editing/workingCopy.ts';
import { addStarterKit } from './kitEdits.ts';

const KIT = resolve(import.meta.dirname, '../../../../starter-kit');
const noTimers: Timers = { set: () => 0, clear: () => undefined };

const listed = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listed(join(folder, entry.name)) : [join(folder, entry.name)],
  );

const kit = new Map(
  listed(KIT).map((path) => [relative(KIT, path).split('\\').join('/'), new Uint8Array(readFileSync(path))]),
);

function setup() {
  const copy = workingCopy(memorySource(readFixture(FIXTURE_LUDUS)));
  const session = editSession({ copy, write: async () => undefined, timers: noTimers });
  return { copy, session };
}

describe('adding the starter kit', () => {
  it('writes its pieces, materials and log entries, leaving the project as sound as it was', async () => {
    const t = setup();
    const before = (await compileProject(t.copy, [])).diagnostics;
    let added = 0;
    await t.session.edit('kit', async (copy) => {
      const result = await addStarterKit(copy, kit);
      added = result.added;
      return result.changes;
    });
    expect(added).toBe(kit.size - 2);
    expect(await t.copy.read('assets/starter-kit/crate.glb')).toEqual(kit.get('assets/starter-kit/crate.glb'));
    expect(await t.copy.read('records/model/kit-crate.json')).toEqual(kit.get('records/model/kit-crate.json'));
    expect(await t.copy.read('project.json')).not.toEqual(kit.get('project.json'));
    const log = JSON.parse(new TextDecoder().decode(await t.copy.read('assets/assets.json')));
    expect(log.files['starter-kit/crate.glb']).toMatchObject({ licence: 'CC0-1.0', author: 'RCJLabs' });
    expect(log.files['portraits/spiculus.svg']).toBeDefined();
    expect((await compileProject(t.copy, [])).diagnostics).toEqual(before);
    await t.session.undo();
    expect(await t.copy.read('assets/starter-kit/crate.glb')).toBeUndefined();
    expect(await t.copy.files('records/model')).toEqual([]);
  });

  it('adds only what the project lacks the second time', async () => {
    const t = setup();
    await t.session.edit('kit', async (copy) => (await addStarterKit(copy, kit)).changes);
    await t.session.edit('lose one', async () => [
      {
        path: 'records/material/kit-wood.json',
        before: kit.get('records/material/kit-wood.json') ?? null,
        after: null,
      },
    ]);
    const again = await addStarterKit(t.copy, kit);
    expect(again.added).toBe(1);
    expect(again.kept).toBe(kit.size - 3);
    expect(again.changes.map((c) => c.path)).toEqual(['records/material/kit-wood.json']);
  });
});
