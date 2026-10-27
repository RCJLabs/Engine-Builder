/**
 * The 2D view's plain values (M7.1, D83, docs/specs/2d-scenes.md#the-editor): screen to world and
 * back, a pan that follows the finger, a zoom by whole steps that keeps the point under the pointer
 * still, Frame at the largest whole zoom, the hit test by a frame's box, and moves in whole pixels.
 */
import { describe, expect, it } from 'vitest';
import type { Drawn } from '../stage2d/draw.ts';
import { dragBy, movedBy, nudgeOf, pickAt, topOf } from './pick2d.ts';
import { artSize, framed, panned, pinchSteps, toScreen, toWorld, unionOf, type View2d, zoomedAt } from './view2d.ts';

const CSS = [400, 200] as const;

describe('the 2D view', () => {
  it('sizes its canvas in art pixels at a whole zoom, never under one', () => {
    expect(artSize(CSS, 1, 2)).toEqual([200, 100]);
    expect(artSize(CSS, 3, 4)).toEqual([300, 150]);
    expect(artSize([401, 1], 1, 4)).toEqual([101, 1]);
  });

  it('maps a point of the box to the world, y up, and a world box back to the box', () => {
    const view: View2d = { centre: [100, 50], zoom: 2 };
    // 200 × 100 art pixels in view: the corner is (0, 0) and the top is y 100.
    expect(toWorld(view, [0, 0], CSS, 1)).toEqual([0, 100]);
    expect(toWorld(view, [400, 200], CSS, 1)).toEqual([200, 0]);
    // At 2×: 400 × 200 art pixels in view, the corner at (−100, −50), each CSS pixel one art pixel.
    expect(toWorld(view, [10, 20], CSS, 2)).toEqual([-90, 130]);
    expect(toScreen(view, { x: 10, y: 40, w: 5, h: 10 }, CSS, 1)).toEqual({ x: 20, y: 100, w: 10, h: 20 });
  });

  it('pans so the world follows the finger, at whole pixels', () => {
    const view: View2d = { centre: [100, 50], zoom: 2 };
    expect(panned(view, view.centre, [-40, 0], 1).centre).toEqual([120, 50]);
    expect(panned(view, view.centre, [0, 30], 3).centre).toEqual([100, 95]);
    expect(panned(view, view.centre, [3, 0], 1).centre).toEqual([99, 50]);
  });

  it('zooms by whole steps between 1 and 16, the point under the pointer staying under it', () => {
    const view: View2d = { centre: [100, 50], zoom: 2 };
    const at = [300, 50] as const;
    const before = toWorld(view, at, CSS, 1);
    const closer = zoomedAt(view, 1, at, CSS, 1);
    expect(closer.zoom).toBe(3);
    const after = toWorld(closer, at, CSS, 1);
    expect(Math.abs(after[0] - before[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(after[1] - before[1])).toBeLessThanOrEqual(1);
    expect(zoomedAt({ ...view, zoom: 16 }, 1, at, CSS, 1).zoom).toBe(16);
    expect(zoomedAt({ ...view, zoom: 1 }, -1, at, CSS, 1).zoom).toBe(1);
    expect(pinchSteps(100, 200, 3)).toBe(3);
    expect(pinchSteps(100, 50, 4)).toBe(-2);
  });

  it('frames boxes at the largest whole zoom they fit with a margin, centred on them', () => {
    expect(unionOf([])).toBeNull();
    expect(
      unionOf([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: -5, w: 5, h: 5 },
      ]),
    ).toEqual({ x: 0, y: -5, w: 25, h: 15 });
    // 960 wide at 400 CSS pixels: under one art pixel a device pixel, so 1, the least.
    expect(framed([{ x: 0, y: 0, w: 960, h: 180 }], CSS, 1)).toEqual({ zoom: 1, centre: [480, 90] });
    // A 16 × 32 torch at a 3× screen: (200·3)/(32+16) is 12.5, so 12.
    expect(framed([{ x: 100, y: 10, w: 16, h: 32 }], CSS, 3)).toEqual({ zoom: 12, centre: [108, 26] });
  });
});

const drawnAs = (path: string, box: Drawn['box']): Drawn => ({ path, at: [0, 0], flip: false, box });

describe('picking and moving in the 2D view', () => {
  const drawn = [
    drawnAs('sky', { x: 0, y: 0, w: 64, h: 90 }),
    drawnAs('wall', { x: 10, y: 50, w: 40, h: 30 }),
    drawnAs('gate/bell', { x: 20, y: 40, w: 8, h: 8 }),
  ];

  it('picks the nearest drawn under the point, by its frame’s box, as its top-level object', () => {
    expect(pickAt(drawn, new Set(), [22, 42])).toBe('gate');
    expect(pickAt(drawn, new Set(), [12, 60])).toBe('wall');
    expect(pickAt(drawn, new Set(), [2, 10])).toBe('sky');
    expect(pickAt(drawn, new Set(), [70, 10])).toBeNull();
    // A layer that repeats is under every point of its rows.
    expect(pickAt(drawn, new Set(['sky']), [70, 10])).toBe('sky');
    expect(pickAt(drawn, new Set(['sky']), [70, 95])).toBeNull();
    expect(topOf('gate/bell/rope')).toBe('gate');
  });

  it('moves the chosen by whole pixels, their depths kept; arrows a pixel, 8 with Shift', () => {
    const space = {
      name: 'yard',
      objects: [{ id: 'torch', at: [10.4, 20, 3] }, { id: 'bell', at: [5, 5, 0] }, { id: 'sky' }],
    } as never;
    expect(dragBy([10.2, 4.9], [13.9, 2.2])).toEqual([4, -3]);
    const moved = movedBy(space, ['torch', 'sky'], [4, -3]);
    expect([...moved.keys()]).toEqual(['torch', 'sky']);
    expect(moved.get('torch')?.at).toEqual([14, 17, 3]);
    expect(moved.get('sky')?.at).toEqual([4, -3, 0]);
    expect(nudgeOf('ArrowLeft', false)).toEqual([-1, 0]);
    expect(nudgeOf('ArrowUp', true)).toEqual([0, 8]);
    expect(nudgeOf('ArrowDown', false)).toEqual([0, -1]);
    expect(nudgeOf('a', false)).toBeNull();
  });
});
