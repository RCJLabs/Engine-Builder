/**
 * Kaldvík's shore (M6.10, D82): the committed terrain files are what shore.ts makes, byte for byte,
 * as the moor's are held to moor.ts; each pad is level at the height the spaces stand things at; and
 * the land runs from under the fjord up to the woods.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groundAt, heightsGrid, makeShore, PADS, WATER } from '../src/shore.ts';

const GAME = resolve(import.meta.dirname, '../../../games/kaldvik');

describe('the shore', () => {
  it('is what pnpm make:kaldvik writes, byte for byte', () => {
    for (const file of makeShore())
      expect(readFileSync(join(GAME, file.path)), file.path).toEqual(Buffer.from(file.bytes));
  });

  it('keeps each pad level at its height, out to its radius', () => {
    const grid = heightsGrid();
    for (const pad of PADS) {
      const [x, z] = pad.at;
      for (const [dx, dz] of [
        [0, 0],
        [pad.r * 0.7, 0],
        [0, -pad.r * 0.7],
        [-pad.r * 0.5, pad.r * 0.5],
      ] as const)
        expect(groundAt(grid, x + dx, z + dz), `${pad.id} at ${dx}, ${dz}`).toBeCloseTo(pad.h, 1);
    }
  });

  it('runs from under the fjord, up the beach, to the woods', () => {
    const grid = heightsGrid();
    expect(groundAt(grid, -120, 0)).toBeLessThan(WATER - 3);
    expect(groundAt(grid, -70, -40)).toBeGreaterThan(WATER - 1);
    expect(groundAt(grid, -70, -40)).toBeLessThan(WATER + 2);
    expect(groundAt(grid, 60, -100)).toBeGreaterThan(5);
  });
});
