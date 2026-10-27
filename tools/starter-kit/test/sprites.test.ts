/**
 * The committed starter sprites are what the script writes (M7.1, D83): file for file and byte for
 * byte, a project the compiler finds nothing wrong with, and every pixel of every sheet one of the
 * palette's sixteen colours or clear. Change any of it by hand and this fails; run
 * `pnpm make:starter-sprites` to write it again.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileProject } from '@eb/compiler';
import { decodePng } from '@eb/export';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../../cli/src/folderSource.ts';
import { PALETTE_HEX } from '../src/sprites/palette.ts';
import { MADE, makeSprites, SPRITES_FOLDER } from '../src/sprites/sprites.ts';

const FOLDER = resolve(import.meta.dirname, '../../../starter-sprites');

const listed = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listed(join(folder, entry.name)) : [join(folder, entry.name)],
  );

const hex = (data: Uint8Array, at: number) =>
  `#${[0, 1, 2].map((k) => (data[at + k] as number).toString(16).padStart(2, '0')).join('')}`;

describe('the starter sprites', () => {
  it('are what the script writes, byte for byte', () => {
    const made = makeSprites();
    const committed = listed(FOLDER)
      .map((path) => relative(FOLDER, path).split('\\').join('/'))
      .sort();
    expect(committed).toEqual(made.map((file) => file.path));
    for (const file of made)
      expect(new Uint8Array(readFileSync(join(FOLDER, file.path))), file.path).toEqual(file.bytes);
  });

  it('compile with no problems', async () => {
    const { diagnostics } = await compileProject(folderSource(FOLDER), []);
    expect(diagnostics).toEqual([]);
  });

  it('hold only the palette’s colours, each pixel opaque or clear', () => {
    const palette = new Set(PALETTE_HEX);
    expect(palette.size).toBe(16);
    const used = new Set<string>();
    for (const { id } of MADE) {
      const { width, height, data } = decodePng(readFileSync(join(FOLDER, `assets/${SPRITES_FOLDER}/${id}.png`)));
      for (let at = 0; at < width * height * 4; at += 4) {
        const alpha = data[at + 3];
        expect([0, 255], id).toContain(alpha);
        if (alpha === 0) continue;
        expect(palette.has(hex(data, at)), `${id} ${hex(data, at)}`).toBe(true);
        used.add(hex(data, at));
      }
    }
    // Every colour of the palette is drawn somewhere: none is there for nothing.
    expect([...used].sort()).toEqual([...palette].sort());
  });

  it('give each figure an idle and a walk, facing right on the frame’s foot', () => {
    for (const who of ['guard', 'keeper', 'villager']) {
      const record = JSON.parse(readFileSync(join(FOLDER, `records/sprite/figure-${who}.json`), 'utf8'));
      expect(Object.keys(record.clips)).toEqual(['idle', 'walk']);
      expect(record.frame).toEqual([16, 24]);
      const { width, data } = decodePng(readFileSync(join(FOLDER, `assets/${SPRITES_FOLDER}/figure-${who}.png`)));
      // Its feet on the bottom row of the first frame, and its eye at the face's right: it looks right.
      const at = (x: number, y: number) => ((24 - 1 - y) * width + x) * 4;
      const drawn = [...Array(16).keys()].filter((x) => data[at(x, 0) + 3] === 255);
      expect(drawn.length, who).toBeGreaterThan(0);
      expect(hex(data, at(9, 16)), who).toBe('#0a0b14');
      expect(hex(data, at(8, 16)), who).toBe('#d8a27c');
    }
  });
});
