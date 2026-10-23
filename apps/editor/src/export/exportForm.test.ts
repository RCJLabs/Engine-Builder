/**
 * export.json in the editor (M4.10): the Problems panel lists what `eb validate` gives for it, E055
 * at the naming record's field; a problem in it opens the Project panel; and the form's edits
 * write the file new, or keep its layout.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileWithGame, EXPORT_FILE, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { projectProblems } from '../problems/collect.ts';
import { placeOf } from '../problems/problemList.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { gameChecks, scriptFiles, stateOf } from '../scripts/gameState.ts';
import { checkJob } from '../scripts/jobs.ts';
import { exportProblems } from './exportChecks.ts';
import { exportChange, exportTypeFile, STARTING_EXPORT } from './exportForm.ts';

const HUT = resolve(import.meta.dirname, '../../../../tools/cli/test/fixtures/hut');

function hut(): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(HUT, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(HUT, path).split('\\').join('/')] = new Uint8Array(readFileSync(path));
  }
  return files;
}

const encode = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
const text = (bytes: Uint8Array | null | undefined) => new TextDecoder().decode(bytes ?? new Uint8Array());

describe('export.json’s problems in the editor (M4.10)', () => {
  it('are the ones eb validate gives, E055 at the naming field', async () => {
    const files = {
      ...hut(),
      [EXPORT_FILE]: encode({
        name: 'The hut above the tree line',
        editions: { taster: { 'leave-out': { records: ['item:rope', 'item:axe'] } } },
        targets: { file: { edition: 'lite' } },
      }),
    };
    const source = memorySource(files);
    const catalog = await readCatalog(source);
    const game = stateOf(await checkJob(await scriptFiles(source), true), true);
    const updated = await updateIndex(EMPTY_INDEX, source, catalog, null, gameChecks(game));
    const index = { ...updated, exports: await exportProblems(source, catalog, updated) };
    const editor = projectProblems(catalog, index, game).filter((d) => d.code >= 'E055' || d.code.startsWith('W13'));
    const validate = (await compileWithGame(source)).diagnostics.filter(
      (d) => d.code >= 'E055' || d.code.startsWith('W13'),
    );
    const brief = (d: { code: string; file?: string; path: string }) => `${d.code} ${d.file} ${d.path}`;
    expect(editor.map(brief)).toEqual(validate.map(brief));
    expect(editor.map(brief)).toEqual([
      'E056 export.json /editions/taster/leave-out/records/1',
      'W138 export.json /name',
      'E056 export.json /targets/file/edition',
      'E055 records/quest/supplies.json /stages/0/objectives/0/done-when',
      'E055 records/shop/store.json /stock/items/0/item',
    ]);
    const own = editor.find((d) => d.file === EXPORT_FILE);
    expect(own && placeOf(own, catalog)).toEqual({ kind: 'panel', panel: 'project' });
  });

  it('are none without export.json, and E007 for one that isn’t JSON', async () => {
    const source = memorySource({ ...hut(), [EXPORT_FILE]: '{ nope' });
    const catalog = await readCatalog(source);
    expect((await exportProblems(source, catalog, EMPTY_INDEX)).map((d) => d.code)).toEqual(['E007']);
    expect(await exportProblems(memorySource(hut()), catalog, EMPTY_INDEX)).toEqual([]);
  });
});

describe('export.json’s form (M4.10)', () => {
  it('offers the editions export.json has, and the project’s types and scenes', () => {
    const file = exportTypeFile({ editions: ['taster'], types: ['item', 'quest'], scenes: ['evening'] });
    const targets = file.fields.targets as { fields: Record<string, { fields: Record<string, unknown> }> };
    expect(targets.fields.file?.fields.edition).toMatchObject({ kind: 'enum', values: ['full', 'taster'] });
    const editions = file.fields.editions as unknown as {
      of: { fields: { 'leave-out': { fields: Record<string, unknown> } } };
    };
    expect(Object.keys(editions.of.fields['leave-out'].fields)).toEqual(['records', 'types', 'scenes', 'assets']);
    const none = exportTypeFile({ editions: [], types: ['item'], scenes: [] });
    const bare = none.fields.editions as unknown as {
      of: { fields: { 'leave-out': { fields: Record<string, unknown> } } };
    };
    expect(Object.keys(bare.of.fields['leave-out'].fields)).toEqual(['records', 'types', 'assets']);
  });

  it('writes a new export.json two spaces deep, and edits one in its own layout', async () => {
    const fresh = memorySource({});
    const [made] = await exportChange(fresh, () => STARTING_EXPORT);
    expect(made?.before).toBeNull();
    expect(text(made?.after)).toBe(`${JSON.stringify(STARTING_EXPORT, null, 2)}\n`);
    const tabbed = memorySource({ [EXPORT_FILE]: '{\n\t"name": "Hut"\n}\n' });
    const [edited] = await exportChange(tabbed, (now) => ({ ...(now as object), orientation: 'portrait' }));
    expect(text(edited?.after)).toBe('{\n\t"name": "Hut",\n\t"orientation": "portrait"\n}\n');
    expect(await exportChange(tabbed, (now) => now)).toEqual([]);
  });
});
