/**
 * The committed starter kit is what the script writes (M5.5, D67): file for file and byte for
 * byte, a project the compiler finds nothing wrong with, every piece packed as the import packs a
 * model and low enough to need no LOD. Change either by hand and this fails; run
 * `pnpm make:starter-kit` to write it again.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileProject, gltfSummary } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../../cli/src/folderSource.ts';
import { makeKit } from '../src/kit.ts';
import { KIT_MATERIALS, PIECES } from '../src/pieces.ts';

const KIT = resolve(import.meta.dirname, '../../../starter-kit');

const listed = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listed(join(folder, entry.name)) : [join(folder, entry.name)],
  );

describe('the starter kit', () => {
  it('is what the script writes, byte for byte', async () => {
    const made = await makeKit();
    const committed = listed(KIT)
      .map((path) => relative(KIT, path).split('\\').join('/'))
      .sort();
    expect(committed).toEqual(made.map((file) => file.path));
    for (const file of made) expect(new Uint8Array(readFileSync(join(KIT, file.path))), file.path).toEqual(file.bytes);
  });

  it('compiles with no problems', async () => {
    const { diagnostics } = await compileProject(folderSource(KIT), []);
    expect(diagnostics).toEqual([]);
  });

  it('has twenty pieces and six materials, each piece packed by Meshopt and under the LOD line', async () => {
    const made = new Map((await makeKit()).map((file) => [file.path, file.bytes]));
    expect(PIECES).toHaveLength(20);
    expect(KIT_MATERIALS.filter((name) => made.has(`records/material/kit-${name}.json`))).toHaveLength(6);
    for (const piece of PIECES) {
      const bytes = made.get(`assets/starter-kit/${piece.id}.glb`);
      const summary = bytes ? gltfSummary(`${piece.id}.glb`, bytes, new Set()) : 'missing';
      if (typeof summary === 'string') throw new Error(`${piece.id}: ${summary}`);
      expect(summary.extensionsRequired, piece.id).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization']);
      expect(summary.triangles, piece.id).toBeLessThanOrEqual(1000);
      expect(summary.slots, piece.id).toEqual(KIT_MATERIALS.filter((name) => piece.parts[name]));
    }
  });
});
