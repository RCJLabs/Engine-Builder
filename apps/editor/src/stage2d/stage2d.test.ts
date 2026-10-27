/**
 * The 2D stage's rules as plain functions (M7.1, D83, docs/specs/2d-scenes.md#the-view): the scale,
 * the camera, a clip's frames, what a space draws and in what order, parallax, where a sprite lands
 * flipped or not, the 44 px targets over uses, and figures walking in straight lines to their marks.
 */
import type { SpaceJson } from '@eb/compiler';
import type { SpriteRecord } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { clampCamera, panned, viewCorner } from './camera.ts';
import { clipOf, frameAt, frameBox } from './clips.ts';
import { drawnAt, onCanvas, tiles, worldBox } from './place.ts';
import { fitScale, zoomed } from './scale.ts';
import { type Item, placesOf, sceneOf } from './scene.ts';
import { TARGET_PX, targetOf } from './uses.ts';
import { SPEED_DEFAULT, sendTo, stepWalker, walkerOf } from './walkers.ts';

const GUARD: SpriteRecord = {
  sheet: 'guard.png',
  frame: [16, 24],
  clips: { idle: { frames: [0, 1], fps: 2 }, walk: { frames: [2, 5], fps: 8 } },
};

describe('the scale', () => {
  it('is the largest whole scale the fit allows, at least 1, and the canvas covers the box', () => {
    expect(fitScale(1280, 720, 1, [320, 180])).toEqual({ scale: 4, cols: 320, rows: 180 });
    expect(fitScale(1300, 720, 1, [320, 180])).toEqual({ scale: 4, cols: 325, rows: 180 });
    // A phone upright at 390 by 844 CSS pixels and three device pixels each: 1170 / 320 → 3.
    expect(fitScale(390, 844, 3, [320, 180])).toEqual({ scale: 3, cols: 390, rows: 844 });
    // Sideways at 844 by 390: height decides, 1170 / 180 → 6.
    expect(fitScale(844, 390, 3, [320, 180])).toEqual({ scale: 6, cols: 422, rows: 195 });
    expect(fitScale(200, 100, 1, [320, 180])).toEqual({ scale: 1, cols: 200, rows: 100 });
    expect(zoomed(3, 2)).toBe(5);
    expect(zoomed(3, -5)).toBe(1);
  });
});

describe('the camera', () => {
  it('stays within the space, centred on an axis the view is wider than, at whole pixels', () => {
    expect(clampCamera([0, 0], [320, 180], [640, 180])).toEqual([160, 90]);
    expect(clampCamera([600, 90], [320, 180], [640, 180])).toEqual([480, 90]);
    expect(clampCamera([300.6, 90], [320, 180], [640, 180])).toEqual([301, 90]);
    expect(clampCamera([300, 500], [390, 844], [640, 180])).toEqual([300, 90]);
    expect(viewCorner([160, 90], [320, 180])).toEqual([0, 0]);
  });

  it('pans the world with the finger', () => {
    expect(panned([200, 90], [30, 0], 1, 3)).toEqual([190, 90]);
    expect(panned([200, 90], [0, -12], 2, 4)).toEqual([200, 84]);
  });
});

describe('a clip', () => {
  it('shows first + floor(t·fps + phase) mod n, held under reduced motion', () => {
    const walk = GUARD.clips.walk as SpriteRecord['clips'][string];
    expect([0, 0.124, 0.125, 0.25, 0.5].map((t) => frameAt(walk, t))).toEqual([2, 2, 3, 4, 2]);
    expect(frameAt(walk, 0, 3)).toBe(5);
    expect(frameAt(walk, 0.4, 0, true)).toBe(2);
    expect(frameAt({ ...walk, loop: false }, 10)).toBe(5);
  });

  it('is the one asked for when the sprite has it, else its own; frames across then down', () => {
    expect(clipOf(GUARD, 'walk')).toBe('walk');
    expect(clipOf(GUARD, 'run')).toBe('idle');
    expect(clipOf(GUARD)).toBe('idle');
    expect(frameBox(GUARD, 64, 5)).toEqual({ x: 16, y: 24 });
  });
});

const KEEP = {
  name: 'Keep',
  view: '2d',
  objects: [
    { id: 'near', shape: 'box', at: [0, 0, 5], color: '#0a0b14', scale: [640, 16, 1] },
    { id: 'sky', shape: 'box', at: [0, 0, -10], components: { parallax: { factor: [0, 1], repeat: true } } },
    { id: 'gate', prefab: 'gate', at: [100, 16, 1], scale: [2, 2, 1] },
    { id: 'guard', record: 'actor:guard', at: [40, 48, 2] },
    { id: 'east', shape: 'box', at: [200, 48, 2] },
  ],
} as unknown as SpaceJson;
const PREFABS = {
  gate: {
    name: 'Gate',
    objects: [{ id: 'bell', shape: 'box', at: [3, 20, 1], components: { sprite: { sprite: 'bell', flip: true } } }],
  },
};
const record = (key: string) => (key === 'actor:guard' ? { name: 'Guard', sprite: 'guard', speed: 30 } : undefined);

describe('what a 2D space draws', () => {
  it('is each object through its prefabs, nearer last, equal depths in the file’s order', () => {
    const scene = sceneOf(KEEP, PREFABS, record);
    expect(scene.map((i) => `${i.path} ${i.at.join(',')} ${i.depth}`)).toEqual([
      'sky 0,0 -10',
      'gate/bell 106,56 2',
      'guard 40,48 2',
      'east 200,48 2',
      'near 0,0 5',
    ]);
    expect(scene.find((i) => i.path === 'gate/bell')?.scale).toEqual([2, 2]);
    expect(scene.find((i) => i.path === 'gate/bell')?.look).toEqual({
      kind: 'sprite',
      sprite: 'bell',
      flip: true,
      phase: 0,
    });
    expect(scene.find((i) => i.path === 'guard')).toMatchObject({ actor: 'guard', look: { sprite: 'guard' } });
    expect(scene.find((i) => i.path === 'sky')?.parallax).toEqual({ factor: [0, 1], repeat: true });
  });

  it('leaves out what is taken, and knows every object’s place for a walker', () => {
    expect(sceneOf(KEEP, PREFABS, record, new Set(['gate/bell'])).map((i) => i.path)).not.toContain('gate/bell');
    expect(placesOf(KEEP, PREFABS).get('east')).toEqual([200, 48]);
    expect(placesOf(KEEP, PREFABS).get('gate/bell')).toEqual([106, 56]);
  });
});

const item = (over: Partial<Item>): Item => ({
  path: 'x',
  at: [100, 20],
  depth: 0,
  scale: [1, 1],
  look: { kind: 'sprite', sprite: 'guard', flip: false, phase: 0 },
  ...over,
});

describe('where an item lands', () => {
  it('puts a sprite’s origin on its place, mirrored across it when flipped', () => {
    expect(worldBox(item({}), [100, 20], GUARD)).toEqual({ x: 92, y: 20, w: 16, h: 24 });
    const flipped = item({ look: { kind: 'sprite', sprite: 'guard', flip: true, phase: 0 } });
    expect(worldBox(flipped, [100, 20], GUARD)).toEqual({ x: 93, y: 20, w: 16, h: 24 });
    expect(worldBox(item({ scale: [2, 2] }), [100, 20], GUARD)).toEqual({ x: 84, y: 20, w: 32, h: 48 });
    expect(worldBox(item({ look: { kind: 'box', colour: '#000000' }, scale: [10, 4] }), [100, 20], undefined)).toEqual({
      x: 95,
      y: 20,
      w: 10,
      h: 4,
    });
  });

  it('turns y up into a canvas’s y down', () => {
    expect(onCanvas({ x: 92, y: 20, w: 16, h: 24 }, [0, 0], 180)).toEqual({ x: 92, y: 136, w: 16, h: 24 });
  });

  it('draws a parallax layer at at + camera·(1 − f), tiled across when it repeats', () => {
    const layer = (f: number) => item({ at: [10, 0], parallax: { factor: [f, 1], repeat: false } });
    expect(drawnAt(layer(0), [300, 90])).toEqual([310, 0]);
    expect(drawnAt(layer(1), [300, 90])).toEqual([10, 0]);
    expect(drawnAt(layer(0.5), [300, 90])).toEqual([160, 0]);
    expect(drawnAt(item({}), [300, 90])).toEqual([100, 20]);
    expect(tiles(10, 64, 140, 100)).toEqual([138, 202]);
    expect(tiles(-30, 16, 0, 40)).toEqual([-14, 2, 18, 34]);
  });
});

describe('a use’s target', () => {
  it('covers its sprite in CSS pixels, grown to 44 about its centre', () => {
    expect(targetOf({ x: 100, y: 50, w: 16, h: 16 }, 3, 3)).toEqual({ x: 86, y: 36, w: TARGET_PX, h: TARGET_PX });
    expect(targetOf({ x: 10, y: 10, w: 16, h: 24 }, 4, 1)).toEqual({ x: 40, y: 40, w: 64, h: 96 });
  });
});

describe('a figure walking', () => {
  it('goes straight to its mark at its speed, facing the way it walks, and arrives once', () => {
    const places = new Map<string, readonly [number, number]>([['east', [200, 48]]]);
    const guard = walkerOf('guard', [40, 48], 40, undefined);
    expect(walkerOf('dog', [0, 0], undefined, { feet: [5, 6, 0] })).toMatchObject({ at: [5, 6], speed: SPEED_DEFAULT });
    sendTo(guard, { goal: 'east' }, places);
    expect(stepWalker(guard, 1)).toBeUndefined();
    expect(guard.at).toEqual([80, 48]);
    expect(guard).toMatchObject({ moving: true, flip: false });
    for (let k = 0; k < 2; k++) expect(stepWalker(guard, 1)).toBeUndefined();
    expect(stepWalker(guard, 1)).toBe('east');
    expect(guard).toMatchObject({ at: [200, 48], moving: false, arrived: 'east' });
    expect(stepWalker(guard, 1)).toBeUndefined();
    places.set('west', [10, 48]);
    sendTo(guard, { goal: 'west' }, places);
    stepWalker(guard, 1);
    expect(guard.flip).toBe(true);
  });

  it('stays put when the sim already heard it arrive at the mark it is sent to', () => {
    const guard = walkerOf('guard', [200, 48], 40, { feet: [200, 48, 0], goal: 'east', arrived: 'east' });
    sendTo(guard, { goal: 'east', arrived: 'east' }, new Map([['east', [200, 48] as const]]));
    expect(stepWalker(guard, 1)).toBeUndefined();
  });
});
