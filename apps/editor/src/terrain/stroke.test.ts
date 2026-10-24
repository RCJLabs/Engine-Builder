/** A brush stroke (M5.3): dabs by distance whatever the moves, Flatten's target, a lift, and undo. */
import { describe, expect, it } from 'vitest';
import type { Brush } from './brushes.ts';
import { heightAt, heightOf, newGrid } from './grid.ts';
import { startStroke } from './stroke.ts';

const SETTINGS = { size: 65, spacing: 1, low: -10, high: 10, layers: [{ name: 'Grass', color: '#5f8f3e' }] };
const brush = (kind: Brush['kind'], more: Partial<Brush> = {}): Brush => ({
  kind,
  radius: 3,
  strength: 0.5,
  layer: 0,
  ...more,
});

describe('a stroke', () => {
  it('ends the same drawn in one move or in many', () => {
    const one = newGrid(SETTINGS);
    const many = newGrid(SETTINGS);
    startStroke(one, brush('raise'), -10, 0).to(10, 0);
    const stroke = startStroke(many, brush('raise'), -10, 0);
    for (let x = -9.7; x < 10; x += 0.3) stroke.to(x, 0);
    stroke.to(10, 0);
    for (let v = 0; v < one.heights.length; v++) expect(many.heights[v]).toBeCloseTo(one.heights[v] as number, 5);
    // Every vertex within the radius of the line, the last dab at x = 10.
    expect(stroke.area()).toEqual({ i0: 19, i1: 45, j0: 29, j1: 35 });
  });

  it('flattens to the height under its first dab', () => {
    const g = newGrid(SETTINGS);
    for (let i = 0; i < 65; i++) for (let j = 0; j < 65; j++) g.heights[j * 65 + i] = i / 8;
    const start = heightAt(g, -8, 0);
    const stroke = startStroke(g, brush('flatten', { strength: 1, radius: 2 }), -8, 0);
    for (let x = -8; x <= 8; x += 0.5) stroke.to(x, 0);
    // Along the line the stroke drew, every height came to the first dab's.
    for (let i = 26; i <= 38; i++) expect(heightOf(g, i, 32)).toBeCloseTo(start, 1);
  });

  it('starts afresh after a lift, dabbing there rather than across the gap', () => {
    const g = newGrid(SETTINGS);
    const stroke = startStroke(g, brush('raise'), -20, 0);
    stroke.lift();
    stroke.to(20, 0);
    expect(heightOf(g, 32, 32)).toBe(0);
    expect(heightOf(g, 52, 32)).toBeGreaterThan(0);
  });

  it('puts the grid back as it was with undo, paint as well as heights', () => {
    const g = newGrid(SETTINGS);
    const heights = g.heights.slice();
    const paint = g.paint.slice();
    const raise = startStroke(g, brush('raise'), 0, 0);
    raise.to(5, 5);
    // The last dab is at 7 m along the diagonal, short of its end: dabs fall every half metre.
    expect(raise.undo()).toEqual({ i0: 29, i1: 39, j0: 29, j1: 39 });
    expect(g.heights).toEqual(heights);
    const daub = startStroke(g, brush('paint', { layer: 2 }), 0, 0);
    expect(daub.part).toBe('paint');
    daub.undo();
    expect(g.paint).toEqual(paint);
  });
});
