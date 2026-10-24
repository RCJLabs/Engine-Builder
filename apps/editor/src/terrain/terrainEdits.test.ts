/** A terrain's edits as file changes (M5.3): added, changed, written after a stroke and taken away, the project left clean. */
import { compileProject, memorySource, type ProjectSource } from '@eb/compiler';
import { decodeGray16, decodePng } from '@eb/export';
import { describe, expect, it } from 'vitest';
import type { FileChange } from '../editing/history.ts';
import { dab } from './brushes.ts';
import { gridFromFiles, heightAt, newGrid } from './grid.ts';
import {
  addTerrain,
  changeTerrain,
  fileOf,
  newTerrain,
  removeLayer,
  removeTerrain,
  writeStroke,
} from './terrainEdits.ts';

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function project(): Record<string, string | Uint8Array> {
  return {
    'project.json': json({ format: 1, id: 'fell', name: 'Fell', version: '0.1.0' }),
    'spaces/fell.json': '{\n  "name": "Fell",\n  "objects": []\n}\n',
  };
}

/** The files after `changes`; a file gone is left out. */
function applied(files: Record<string, string | Uint8Array>, changes: readonly FileChange[]) {
  const out: Record<string, string | Uint8Array> = { ...files };
  for (const change of changes) {
    if (change.after) out[change.path] = change.after;
    else delete out[change.path];
  }
  return out;
}

const problems = async (files: Record<string, string | Uint8Array>) =>
  (await compileProject(memorySource(files), [])).diagnostics.map((d) => `${d.code} ${d.file} ${d.path}`);

const settingsOf = (files: Record<string, string | Uint8Array>) =>
  JSON.parse(new TextDecoder().decode(files['spaces/fell.json'] as Uint8Array)).terrain;

describe('a terrain’s edits', () => {
  it('add it with its two files, the settings between the name and the objects, and nothing for eb to find', async () => {
    const files = project();
    const after = applied(files, await addTerrain(memorySource(files), 'fell', newTerrain(65)));
    expect(new TextDecoder().decode(after['spaces/fell.json'] as Uint8Array)).toMatch(
      /^\{\n {2}"name": "Fell",\n {2}"terrain": \{.*\},\n {2}"objects": \[\]\n\}\n$/,
    );
    expect(Object.keys(after).sort()).toEqual([
      'project.json',
      'spaces/fell.heights.png',
      'spaces/fell.json',
      'spaces/fell.paint.png',
    ]);
    expect(await problems(after)).toEqual([]);
    // Flat at 0 m, in a range of −10 to 40.
    expect(new Set(decodeGray16(after['spaces/fell.heights.png'] as Uint8Array).data)).toEqual(new Set([13107]));
  });

  it('write a stroke’s part, and nothing when the stroke changed nothing', async () => {
    const files = applied(project(), await addTerrain(memorySource(project()), 'fell', newTerrain(65)));
    const source: ProjectSource = memorySource(files);
    const grid = gridFromFiles(
      newTerrain(65),
      decodeGray16(files['spaces/fell.heights.png'] as Uint8Array),
      decodePng(files['spaces/fell.paint.png'] as Uint8Array),
    );
    expect(await writeStroke(source, 'fell', 'heights', fileOf(grid, 'heights'))).toEqual([]);
    dab(grid, 0, 0, { kind: 'raise', radius: 4, strength: 1, layer: 0, foliage: 0 });
    const changes = await writeStroke(source, 'fell', 'heights', fileOf(grid, 'heights'));
    expect(changes.map((c) => c.path)).toEqual(['spaces/fell.heights.png']);
    expect(changes[0]?.before).toEqual(files['spaces/fell.heights.png']);
  });

  it('change the range keeping each height in metres, clamped, and leave the size as it was', async () => {
    const start = applied(project(), await addTerrain(memorySource(project()), 'fell', newTerrain(65)));
    const grid = newGrid(newTerrain(65));
    dab(grid, 0, 0, { kind: 'raise', radius: 4, strength: 1, layer: 0, foliage: 0 });
    const raised = applied(start, await writeStroke(memorySource(start), 'fell', 'heights', fileOf(grid, 'heights')));
    const next = { ...newTerrain(65), size: 129, low: 0, high: 0.1, spacing: 2 };
    const after = applied(raised, await changeTerrain(memorySource(raised), 'fell', next));
    expect(settingsOf(after)).toEqual({ ...next, size: 65 });
    const read = gridFromFiles(
      settingsOf(after),
      decodeGray16(after['spaces/fell.heights.png'] as Uint8Array),
      decodePng(after['spaces/fell.paint.png'] as Uint8Array),
    );
    // The middle rose 0.25 m: clamped to 0.1 now. A corner stays at 0.
    expect(heightAt(read, 0, 0)).toBeCloseTo(0.1, 4);
    expect(heightAt(read, -64, -64)).toBeCloseTo(0, 4);
    expect(await problems(after)).toEqual([]);
  });

  it('take a layer away with its weights, the later layers’ moving down one', async () => {
    const start = applied(project(), await addTerrain(memorySource(project()), 'fell', newTerrain(65)));
    const grid = newGrid(newTerrain(65));
    dab(grid, 0, 0, { kind: 'paint', radius: 4, strength: 1, layer: 2, foliage: 0 });
    dab(grid, 10, 0, { kind: 'paint', radius: 4, strength: 1, layer: 3, foliage: 0 });
    const painted = applied(start, await writeStroke(memorySource(start), 'fell', 'paint', fileOf(grid, 'paint')));
    const after = applied(painted, await removeLayer(memorySource(painted), 'fell', 1));
    expect(settingsOf(after).layers.map((l: { name: string }) => l.name)).toEqual(['Grass', 'Sand', 'Snow']);
    const paint = decodePng(after['spaces/fell.paint.png'] as Uint8Array).data;
    // The middle was all Sand, now layer 2's channel; ten metres east all Snow, now the third.
    expect([...paint.subarray((32 * 65 + 32) * 4, (32 * 65 + 32) * 4 + 4)]).toEqual([0, 255, 0, 0]);
    expect([...paint.subarray((32 * 65 + 42) * 4, (32 * 65 + 42) * 4 + 4)]).toEqual([0, 0, 255, 0]);
    expect(await problems(after)).toEqual([]);
    // The last layer stays.
    const one = applied(after, await removeLayer(memorySource(after), 'fell', 0));
    const last = applied(one, await removeLayer(memorySource(one), 'fell', 0));
    const lone = applied(last, await removeLayer(memorySource(last), 'fell', 0));
    expect(settingsOf(lone).layers.map((l: { name: string }) => l.name)).toEqual(['Snow']);
  });

  it('take it away with its files', async () => {
    const start = applied(project(), await addTerrain(memorySource(project()), 'fell', newTerrain(65)));
    const after = applied(start, await removeTerrain(memorySource(start), 'fell'));
    expect(Object.keys(after).sort()).toEqual(['project.json', 'spaces/fell.json']);
    expect(settingsOf(after)).toBeUndefined();
    expect(await problems(after)).toEqual([]);
  });
});
