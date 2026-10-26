/**
 * The committed starter character is what the script writes (M6.5, D77): file for file and byte
 * for byte, a project the compiler finds nothing wrong with, a skeleton already on the engine's rig
 * that the import turns not at all, and clips that keep the body out of the ground. Change any of
 * it by hand and this fails; run `pnpm make:starter-character` to write it again.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileProject } from '@eb/compiler';
import { HUMANOID } from '@eb/models/humanoid';
import { readModel } from '@eb/models/pack';
import { rigModel } from '@eb/models/rig';
import { describe, expect, it } from 'vitest';
import { poseAt, skinned } from '../../../packages/models/test/rigs.ts';
import { folderSource } from '../../cli/src/folderSource.ts';
import { CHARACTER, makeCharacter } from '../src/character/character.ts';
import { CLIPS } from '../src/character/clips.ts';
import { HEIGHT } from '../src/character/skeleton.ts';

const FOLDER = resolve(import.meta.dirname, '../../../starter-character');
const GLB = `assets/${CHARACTER}/${CHARACTER}.glb`;

const listed = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listed(join(folder, entry.name)) : [join(folder, entry.name)],
  );

const character = async () =>
  readModel({ name: `${CHARACTER}.glb`, bytes: new Uint8Array(readFileSync(join(FOLDER, GLB))) }, [], {});

/** The lowest and highest the body reaches through `clip`, sampled twenty times between its keys. */
async function reach(clip: string) {
  const doc = await character();
  const length = CLIPS.find((c) => c.name === clip)?.length ?? 0;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let k = 0; k <= 20; k++) {
    const ys = skinned(doc, poseAt(doc, (length * k) / 20, doc, clip)).map((v) => v.y);
    low = Math.min(low, ...ys);
    high = Math.max(high, ...ys);
  }
  return { low, high };
}

describe('the starter character', () => {
  it('is what the script writes, byte for byte', async () => {
    const made = await makeCharacter();
    const committed = listed(FOLDER)
      .map((path) => relative(FOLDER, path).split('\\').join('/'))
      .sort();
    expect(committed).toEqual(made.map((file) => file.path));
    for (const file of made)
      expect(new Uint8Array(readFileSync(join(FOLDER, file.path))), file.path).toEqual(file.bytes);
  });

  it('compiles with no problems', async () => {
    const { diagnostics } = await compileProject(folderSource(FOLDER), []);
    expect(diagnostics).toEqual([]);
  });

  it('is on the rig already: every bone found by its name, none turned, facing −z', async () => {
    const rigged = rigModel(await character());
    expect(rigged).not.toBeNull();
    expect(rigged?.rigged).toBe(true);
    expect(rigged?.missing).toEqual([]);
    expect(Object.keys(rigged?.bones ?? {}).sort()).toEqual([...HUMANOID].sort());
    expect(rigged?.turned).toEqual([]);
    expect(rigged?.faced).toBe(false);
    // In place already: the file's hips go nowhere, so the pace the record gives is the generator's.
    // All but the fall's: it lands 0.55 m behind where it stood, which an import would take out.
    expect(rigged?.clips.map((clip) => clip.name)).toEqual(CLIPS.map((clip) => clip.name));
    for (const clip of rigged?.clips ?? []) {
      expect(clip.length, clip.name).toBeCloseTo(CLIPS.find((c) => c.name === clip.name)?.length ?? 0, 5);
      expect(clip.pace, clip.name).toBeCloseTo(clip.name === 'fall-down' ? 0.55 / 0.8 : 0, 3);
    }
    const record = JSON.parse(readFileSync(join(FOLDER, `records/model/${CHARACTER}.json`), 'utf8'));
    expect(record.clips.find((clip: { name: string }) => clip.name === 'walk').pace).toBe(1.4);
    expect(record.clips.find((clip: { name: string }) => clip.name === 'run').pace).toBe(4);
  });

  it('stands its height with its soles on the ground', async () => {
    const { low, high } = await reach('idle');
    expect(low).toBeCloseTo(0, 2);
    expect(Math.abs(high - HEIGHT)).toBeLessThan(0.03);
  });

  it('never goes into the ground, and keeps a foot on it wherever it does not leave it', async () => {
    const leaves = new Set(['run', 'jump', 'fall', 'land', 'fall-down', 'lie']);
    for (const clip of CLIPS) {
      const { low } = await reach(clip.name);
      expect(low, clip.name).toBeGreaterThan(-0.005);
      if (!leaves.has(clip.name)) expect(low, clip.name).toBeLessThan(0.005);
    }
  });
});
