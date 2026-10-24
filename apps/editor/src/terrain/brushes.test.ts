/** The terrain's brushes (M5.3, D65): each dab's sum, the falloff, the paint's balance, and dabs by distance. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Brush, dab, dabsAlong, paintVertex, RAISE_STEP } from './brushes.ts';
import { heightOf, newGrid } from './grid.ts';

const SETTINGS = {
  size: 65,
  spacing: 1,
  low: -10,
  high: 10,
  layers: [
    { name: 'Grass', color: '#5f8f3e' },
    { name: 'Rock', color: '#8a8580' },
  ],
};
const brush = (kind: Brush['kind'], more: Partial<Brush> = {}): Brush => ({
  kind,
  radius: 4,
  strength: 1,
  layer: 0,
  ...more,
});
// The terrain's middle vertex, (32, 32), is at the origin.
const MID = 32;

describe('Raise and Lower', () => {
  it('move the middle by a quarter metre a dab at strength 1, less towards the edge, nothing past it', () => {
    const g = newGrid(SETTINGS);
    const area = dab(g, 0, 0, brush('raise'));
    expect(area).toEqual({ i0: 28, i1: 36, j0: 28, j1: 36 });
    expect(heightOf(g, MID, MID)).toBeCloseTo(RAISE_STEP, 6);
    // 2 m out of 4: (1 − ¼)² of the step.
    expect(heightOf(g, MID + 2, MID)).toBeCloseTo(RAISE_STEP * 0.5625, 6);
    expect(heightOf(g, MID + 4, MID)).toBe(0);
    dab(g, 0, 0, brush('lower', { strength: 0.5 }));
    expect(heightOf(g, MID, MID)).toBeCloseTo(RAISE_STEP / 2, 6);
  });

  it('stop at the range', () => {
    const g = newGrid(SETTINGS);
    for (let n = 0; n < 100; n++) dab(g, 0, 0, brush('raise'));
    expect(heightOf(g, MID, MID)).toBe(10);
  });
});

describe('Smooth and Flatten', () => {
  it('Smooth draws a spike towards its neighbours, and leaves flat ground flat', () => {
    const g = newGrid(SETTINGS);
    g.heights[MID * 65 + MID] = 9;
    dab(g, 0, 0, brush('smooth'));
    expect(heightOf(g, MID, MID)).toBeCloseTo(1, 6);
    // Its neighbours, read before the dab, rise towards their old mean, which held the spike.
    expect(heightOf(g, MID + 1, MID)).toBeGreaterThan(0);
    const flat = newGrid(SETTINGS);
    dab(flat, 0, 0, brush('smooth'));
    expect(new Set(flat.heights)).toEqual(new Set([0]));
  });

  it('Flatten draws heights towards its target by the strength', () => {
    const g = newGrid(SETTINGS);
    dab(g, 0, 0, brush('flatten', { strength: 0.5 }), 6);
    expect(heightOf(g, MID, MID)).toBeCloseTo(3, 6);
    dab(g, 0, 0, brush('flatten'), 6);
    expect(heightOf(g, MID, MID)).toBeCloseTo(6, 6);
  });
});

describe('Paint', () => {
  it('adds to its layer and takes from the others in proportion, the four always summing to 255', () => {
    const paint = new Uint8Array([100, 100, 55, 0]);
    paintVertex(paint, 0, 3, 51);
    expect([...paint]).toEqual([80, 80, 44, 51]);
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 4, maxLength: 4 }),
        fc.integer({ min: 0, max: 3 }),
        fc.float({ min: 0, max: 300, noNaN: true }),
        (start, layer, add) => {
          const p = new Uint8Array(start);
          paintVertex(p, 0, layer, add);
          expect(p.reduce((s, v) => s + v, 0)).toBe(255);
        },
      ),
    );
  });

  it('dabs the layer chosen, fully at the middle at strength 1', () => {
    const g = newGrid(SETTINGS);
    dab(g, 0, 0, brush('paint', { layer: 1 }));
    const at = (MID * 65 + MID) * 4;
    expect([...g.paint.subarray(at, at + 4)]).toEqual([0, 255, 0, 0]);
    expect(g.paint[(MID * 65 + MID + 4) * 4]).toBe(255);
  });
});

describe('dabs along a stroke', () => {
  it('fall every step whatever the moves, the distance since the last carried over', () => {
    let carried = 0.5;
    const points: [number, number][] = [];
    let from: [number, number] = [0, 0];
    for (const to of [
      [0.3, 0],
      [1.7, 0],
      [1.7, 0],
      [3, 0],
    ] as [number, number][]) {
      const next = dabsAlong(from, to, 0.5, carried);
      points.push(...next.points);
      carried = next.carried;
      from = to;
    }
    expect(points.map(([x]) => Number(x.toFixed(6)))).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
  });
});
