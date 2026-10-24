/** A terrain's grid and its two files (M5.3, D65): what is read is what was written, to the 65535th. */
import { decodeGray16, decodePng, encodeGray16, encodePng } from '@eb/export';
import { describe, expect, it } from 'vitest';
import { gridFromFiles, heightAt, heightsFile, newGrid, paintFile, rerange } from './grid.ts';

const SETTINGS = { size: 65, spacing: 2, low: -10, high: 40, layers: [{ name: 'Grass', color: '#5f8f3e' }] };

/** A grid with heights over all of its range, as a sculpted terrain has. */
function hilly() {
  const g = newGrid(SETTINGS);
  for (let v = 0; v < g.heights.length; v++) g.heights[v] = -10 + ((v * 37) % 5001) / 100;
  return g;
}

describe('a new terrain', () => {
  it('is flat at 0 m, or at the range’s nearer end, and all of layer 1', () => {
    const g = newGrid(SETTINGS);
    expect(new Set(g.heights)).toEqual(new Set([0]));
    expect(g.paint.subarray(0, 8)).toEqual(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0]));
    expect(new Set(newGrid({ ...SETTINGS, low: 5, high: 9 }).heights)).toEqual(new Set([5]));
  });
});

describe('its files', () => {
  it('give back every height to within half a 65535th of the range, and the same bytes written again', () => {
    const g = hilly();
    const heights = encodeGray16(heightsFile(g));
    const paint = encodePng(paintFile(g));
    const read = gridFromFiles(SETTINGS, decodeGray16(heights), decodePng(paint));
    const step = (SETTINGS.high - SETTINGS.low) / 65535;
    for (let v = 0; v < g.heights.length; v++) {
      expect(Math.abs((read.heights[v] as number) - (g.heights[v] as number))).toBeLessThanOrEqual(step / 2 + 1e-6);
    }
    // Read and written again unchanged: byte for byte, so opening a terrain never changes it.
    expect(encodeGray16(heightsFile(read))).toEqual(heights);
    expect(encodePng(paintFile(read))).toEqual(paint);
  });

  it('are refused at another size, as E067 refuses them', () => {
    const small = newGrid({ ...SETTINGS, size: 129 });
    expect(() =>
      gridFromFiles(SETTINGS, decodeGray16(encodeGray16(heightsFile(small))), decodePng(encodePng(paintFile(small)))),
    ).toThrow('The heights are 129×129; the terrain is 65×65');
    const tall = { width: 65, height: 129, data: new Uint16Array(65 * 129) };
    expect(() => gridFromFiles(SETTINGS, tall, decodePng(encodePng(paintFile(newGrid(SETTINGS)))))).toThrow(
      'The heights are 65×129; the terrain is 65×65',
    );
  });
});

describe('heights', () => {
  it('are read on the triangles drawn: each vertex its own, between them on the split from (i+1, j) to (i, j+1)', () => {
    const g = newGrid({ ...SETTINGS, spacing: 1 });
    const e = 32;
    // The square whose corners are (0,0) 0 m, (1,0) 4, (0,1) 8 and (1,1) 20.
    g.heights[0] = 0;
    g.heights[1] = 4;
    g.heights[65] = 8;
    g.heights[66] = 20;
    expect(heightAt(g, -e + 1, -e + 1)).toBeCloseTo(20, 6);
    expect(heightAt(g, -e + 0.25, -e + 0.25)).toBeCloseTo(0 + 4 * 0.25 + 8 * 0.25, 6);
    // Past the diagonal, the far triangle: 20 + (8 − 20) × 0.25 + (4 − 20) × 0.25.
    expect(heightAt(g, -e + 0.75, -e + 0.75)).toBeCloseTo(20 - 12 * 0.25 - 16 * 0.25, 6);
    // Outside, the nearest edge.
    expect(heightAt(g, -e - 50, -e - 50)).toBe(0);
  });

  it('keep their metres when the range changes, clamped to it', () => {
    const g = hilly();
    const narrow = rerange(g, 0, 20);
    for (let v = 0; v < g.heights.length; v++) {
      expect(narrow.heights[v]).toBe(Math.min(20, Math.max(0, g.heights[v] as number)));
    }
  });
});
