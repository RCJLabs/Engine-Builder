/** A terrain's foliage as file changes (M5.6): added, filled, taken out and made new, the project left clean. */
import { compileProject, memorySource, type ProjectSource } from '@eb/compiler';
import { decodePng, encodePng } from '@eb/export';
import { FOLIAGE_PRESETS } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import type { FileChange } from '../editing/history.ts';
import { addTerrain, newTerrain } from '../terrain/terrainEdits.ts';
import { addFoliage, fillFoliage, newFoliage, presetModel, removeFoliage } from './foliageEdits.ts';

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
type Files = Record<string, string | Uint8Array>;

/** The files after `changes`; a file gone is left out. */
function applied(files: Files, changes: readonly FileChange[]): Files {
  const out: Files = { ...files };
  for (const change of changes) {
    if (change.after) out[change.path] = change.after;
    else delete out[change.path];
  }
  return out;
}

const source = (files: Files): ProjectSource => memorySource(files);

/** A glade with a 65-vertex terrain, a model and two foliage records, Rock painted on its east half. */
async function glade(): Promise<Files> {
  const start: Files = {
    'project.json': json({ format: 1, id: 'glade', name: 'Glade', version: '0.1.0' }),
    'assets/assets.json': json({ files: {} }),
    'records/model/kit-pine.json': json({ file: 'models/pine.glb' }),
    'records/foliage/pines.json': json({ model: 'kit-pine' }),
    'records/foliage/ferns.json': json({ model: 'kit-pine' }),
    'spaces/glade.json': '{\n  "name": "Glade",\n  "objects": []\n}\n',
  };
  const files = applied(start, await addTerrain(source(start), 'glade', { ...newTerrain(65), size: 65 }));
  const paint = decodePng(files['spaces/glade.paint.png'] as Uint8Array);
  for (let v = 0; v < 65 * 65; v++) {
    if (v % 65 > 32) [paint.data[v * 4], paint.data[v * 4 + 1]] = [0, 255];
  }
  return { ...files, 'spaces/glade.paint.png': encodePng(paint) };
}

const text = (file: string | Uint8Array | undefined) =>
  typeof file === 'string' ? file : new TextDecoder().decode(file ?? new Uint8Array());
const terrainOf = (files: Files) => JSON.parse(text(files['spaces/glade.json'])).terrain;
const density = (files: Files) => decodePng(files['spaces/glade.foliage.png'] as Uint8Array).data;
/** The project's problems but for the model's missing file, which these tests don't give. */
const problems = async (files: Files) =>
  (await compileProject(memorySource(files), [])).diagnostics
    .filter((d) => d.file !== 'records/model/kit-pine.json')
    .map((d) => `${d.code} ${d.file} ${d.path}`);

describe('foliage in a terrain', () => {
  it('is added with its density file at 0, once each, four at most, the project clean', async () => {
    let files = await glade();
    files = applied(files, await addFoliage(source(files), 'glade', 'pines'));
    expect(terrainOf(files).foliage).toEqual(['pines']);
    expect(density(files).every((v) => v === 0)).toBe(true);
    expect(density(files)).toHaveLength(65 * 65 * 4);
    expect(await problems(files)).toEqual([]);
    expect(await addFoliage(source(files), 'glade', 'pines')).toEqual([]);
    for (const id of ['ferns', 'c', 'd']) files = applied(files, await addFoliage(source(files), 'glade', id));
    expect(await addFoliage(source(files), 'glade', 'e')).toEqual([]);
    expect(terrainOf(files).foliage).toEqual(['pines', 'ferns', 'c', 'd']);
  });

  it('fills from a paint layer, everywhere or nowhere, its own channel alone', async () => {
    let files = await glade();
    files = applied(files, await addFoliage(source(files), 'glade', 'pines'));
    files = applied(files, await addFoliage(source(files), 'glade', 'ferns'));
    files = applied(files, await fillFoliage(source(files), 'glade', 1, { kind: 'layer', layer: 1 }));
    const paint = decodePng(files['spaces/glade.paint.png'] as Uint8Array).data;
    const filled = density(files);
    for (let v = 0; v < 65 * 65; v++) {
      expect(filled[v * 4 + 1]).toBe(paint[v * 4 + 1]);
      expect(filled[v * 4]).toBe(0);
    }
    files = applied(files, await fillFoliage(source(files), 'glade', 0, { kind: 'everywhere' }));
    expect(density(files)[0]).toBe(255);
    files = applied(files, await fillFoliage(source(files), 'glade', 1, { kind: 'nowhere' }));
    expect(
      density(files)
        .filter((_, n) => n % 4 === 1)
        .every((v) => v === 0),
    ).toBe(true);
    expect(
      density(files)
        .filter((_, n) => n % 4 === 0)
        .every((v) => v === 255),
    ).toBe(true);
  });

  it('is taken out with its channel, the later ones moved down, and the file with the last', async () => {
    let files = await glade();
    files = applied(files, await addFoliage(source(files), 'glade', 'pines'));
    files = applied(files, await addFoliage(source(files), 'glade', 'ferns'));
    files = applied(files, await fillFoliage(source(files), 'glade', 1, { kind: 'layer', layer: 1 }));
    const ferns = density(files).filter((_, n) => n % 4 === 1);
    files = applied(files, await removeFoliage(source(files), 'glade', 0));
    expect(terrainOf(files).foliage).toEqual(['ferns']);
    expect(density(files).filter((_, n) => n % 4 === 0)).toEqual(ferns);
    expect(
      density(files)
        .filter((_, n) => n % 4 === 1)
        .every((v) => v === 0),
    ).toBe(true);
    files = applied(files, await removeFoliage(source(files), 'glade', 0));
    expect(terrainOf(files)).not.toHaveProperty('foliage');
    expect(files).not.toHaveProperty(['spaces/glade.foliage.png']);
    expect(await problems(files)).toEqual([]);
  });

  it('is made new from a preset, with the kit’s model when the project has it, and added', async () => {
    const trees = FOLIAGE_PRESETS.find((p) => p.id === 'trees');
    if (!trees) throw new Error('no Trees preset');
    expect(presetModel(trees, ['crate', 'kit-pine'])).toBe('kit-pine');
    expect(presetModel(trees, ['crate'])).toBe('crate');
    expect(presetModel(trees, [])).toBeNull();
    const files = await glade();
    const made = await newFoliage(source(files), { id: 'glade', name: 'Glade' }, trees, 'kit-pine', new Set(['pines']));
    expect(made.id).toBe('glade-trees');
    const after = applied(files, made.changes);
    expect(JSON.parse(text(after['records/foliage/glade-trees.json']))).toEqual({
      name: 'Glade, trees',
      model: 'kit-pine',
      ...trees.value,
    });
    expect(terrainOf(after).foliage).toEqual(['glade-trees']);
    expect(await problems(after)).toEqual([]);
    const again = await newFoliage(
      source(after),
      { id: 'glade', name: 'Glade' },
      trees,
      null,
      new Set(['glade-trees']),
    );
    expect(again.id).toBe('glade-trees-2');
  });
});
