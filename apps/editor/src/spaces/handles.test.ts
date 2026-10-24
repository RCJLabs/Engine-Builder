import { describe, expect, it } from 'vitest';
import { handleName } from './gizmoMath.ts';
import { gripsOf, hitHandle, type Project, REACH, SHAPE, screenDistance, shapesOf } from './handles.ts';

// Looking down the z axis from far off, 100 px to the metre, the origin at (500, 500): x right, y up.
const flat: Project = ([x, y]) => [500 + x * 100, 500 - y * 100];

describe('the gizmo’s handles', () => {
  it('are hit within 22 px of their line or point, so each hit area is 44 px across', () => {
    const move = shapesOf('move', [0, 0, 0], 1);
    // The x arrow runs from 25 px to 100 px right of the pivot.
    expect(hitHandle(move, flat, [560, 500 + REACH])).toEqual({ kind: 'move', axis: 0 });
    expect(hitHandle(move, flat, [560, 500 + REACH + 1])).toBeNull();
    expect(hitHandle(move, flat, [100 + 500 + REACH, 500])).toEqual({ kind: 'move', axis: 0 });
    // The square across z sits at (35, 35) px off the pivot, between x and y.
    expect(hitHandle(move, flat, [500 + 100 * SHAPE.square, 500 - 100 * SHAPE.square])).toEqual({
      kind: 'plane',
      axis: 2,
    });
  });

  it('give the nearest handle where two reach', () => {
    // Seen at a slant, so the z block isn't hidden behind the centre's.
    const oblique: Project = ([x, y, z]) => [500 + x * 100 - z * 50, 500 - y * 100 + z * 50];
    const scale = shapesOf('scale', [0, 0, 0], 0.3);
    // The x block 30 px right of the centre block: a press 10 px right is the centre's, 20 px the block's.
    expect(hitHandle(scale, oblique, [510, 500])).toEqual({ kind: 'scale-all' });
    expect(hitHandle(scale, oblique, [520, 500])).toEqual({ kind: 'scale', axis: 0 });
  });

  it('ring each axis, a ring seen edge on being a line', () => {
    const turn = shapesOf('turn', [0, 0, 0], 1);
    const z = turn.find((s) => handleName(s.handle) === 'turn-z');
    // The z ring faces the camera: a circle 85 px round the pivot.
    expect(z && screenDistance(z, flat, [500, 500 - 85])).toBeCloseTo(0, 0);
    expect(z && screenDistance(z, flat, [500, 500])).toBeCloseTo(85, 0);
    // The y ring is seen edge on, as the line y = 500 from 415 to 585 px.
    expect(hitHandle(turn, flat, [450, 510])).toEqual({ kind: 'turn', axis: 1 });
  });

  it('are out of reach behind the camera', () => {
    const behind: Project = () => null;
    expect(hitHandle(shapesOf('move', [0, 0, 0], 1), behind, [500, 500])).toBeNull();
  });

  it('are taken hold of where no other handle reaches, for the e2e', () => {
    const move = shapesOf('move', [0, 0, 0], 1);
    const grips = gripsOf(move, flat, [0, 0, 0]);
    expect(grips.map((g) => g.name)).toEqual(['move-x', 'move-y', 'move-z', 'plane-x', 'plane-y', 'plane-z']);
    for (const grip of grips.filter((g) => g.name !== 'move-z' && g.name.startsWith('move'))) {
      const shape = move.find((s) => handleName(s.handle) === grip.name);
      expect(hitHandle(move, flat, grip.at), grip.name).toEqual(shape?.handle);
    }
    expect(grips[0]?.along).toEqual([1, 0]);
    expect(grips[1]?.along).toEqual([0, -1]);
  });
});
