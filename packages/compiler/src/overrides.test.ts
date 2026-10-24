/** Placements' overrides as plain functions (M5.2, D64): layers laid over objects, and what passes on. */
import { describe, expect, it } from 'vitest';
import { eachPlaced, mergeComponents, overridden, passedOn, placedObjects, recordHere } from './overrides.ts';
import type { SpaceJson, SpaceObject } from './spaceShape.ts';

const bulb: SpaceObject = {
  id: 'bulb',
  shape: 'sphere',
  at: [0, 2, 0],
  color: '#ffffff',
  components: { light: { color: '#ffeecc', range: 8 } },
};

describe('an override', () => {
  it('replaces place and looks whole, and merges components field by field', () => {
    const seen = overridden(bulb, [{ at: [0, 3, 0], color: '#ff0000', components: { light: { range: 12 } } }]);
    expect(seen).toEqual({
      id: 'bulb',
      shape: 'sphere',
      at: [0, 3, 0],
      color: '#ff0000',
      components: { light: { color: '#ffeecc', range: 12 } },
    });
    // The object itself is left as it was.
    expect(bulb.components).toEqual({ light: { color: '#ffeecc', range: 8 } });
  });

  it('adds a kind the object lacks, and lays layers innermost first', () => {
    const seen = overridden(bulb, [
      { components: { sound: { of: 'sound:hum' } }, at: [1, 0, 0] },
      { at: [2, 0, 0] },
      undefined,
      'not an override',
    ]);
    expect(seen.at).toEqual([2, 0, 0]);
    expect(seen.components).toEqual({ light: { color: '#ffeecc', range: 8 }, sound: { of: 'sound:hum' } });
  });

  it('merges components with nothing to merge into, and gives nothing for nothing', () => {
    expect(mergeComponents(undefined, { light: { range: 2 } })).toEqual({ light: { range: 2 } });
    expect(mergeComponents(undefined, undefined)).toBeUndefined();
    expect(mergeComponents({ light: { range: 2 } }, { light: 'x' })).toEqual({ light: { range: 2 } });
  });
});

describe('what a placement passes on', () => {
  const lamp: SpaceJson = { name: 'Lamp', objects: [bulb, { id: 'post', shape: 'cylinder' }] };
  const prefabs = new Map<string, SpaceJson>([
    ['lamp', lamp],
    [
      'street',
      { name: 'Street', objects: [{ id: 'lamp', prefab: 'lamp', overrides: { bulb: { color: '#00ff00' } } }] },
    ],
  ]);

  it('is its own overrides, then each layer’s, by the ids of what it places', () => {
    const placement: SpaceObject = { id: 'l', prefab: 'lamp', overrides: { bulb: { at: [0, 4, 0] } } };
    const passed = passedOn(placement, [{ overrides: { post: { scale: [1, 2, 1] } } }, { name: 'x' }]);
    expect(passed).toEqual([{ bulb: { at: [0, 4, 0] } }, { post: { scale: [1, 2, 1] } }]);
    const placed = placedObjects(lamp, passed);
    expect(placed.map((p) => [p.object.id, p.layers])).toEqual([
      ['bulb', [{ at: [0, 4, 0] }, undefined]],
      ['post', [undefined, { scale: [1, 2, 1] }]],
    ]);
  });

  it('reaches an object two prefabs down, the outer placement laid last', () => {
    const street: SpaceObject = {
      id: 'street',
      prefab: 'street',
      overrides: { lamp: { overrides: { bulb: { color: '#0000ff', components: { light: { range: 20 } } } } } },
    };
    const seen: [string, SpaceObject][] = [];
    eachPlaced(street, prefabs, (object, ids) => seen.push([ids.join('/'), object]));
    expect(seen.map(([ids]) => ids)).toEqual(['street', 'street/lamp', 'street/lamp/bulb', 'street/lamp/post']);
    const found = seen.find(([ids]) => ids === 'street/lamp/bulb')?.[1];
    expect(found?.color).toBe('#0000ff');
    expect(found?.components).toEqual({ light: { color: '#ffeecc', range: 20 } });
    // Without the outer override, the street's own colour shows.
    const plain: [string, SpaceObject][] = [];
    eachPlaced({ id: 's', prefab: 'street' }, prefabs, (object, ids) => plain.push([ids.join('/'), object]));
    expect(plain.find(([ids]) => ids === 's/lamp/bulb')?.[1].color).toBe('#00ff00');
  });

  it('stops at a depth, so a loop (E061) ends', () => {
    const loop = new Map<string, SpaceJson>([['me', { name: 'Me', objects: [{ id: 'again', prefab: 'me' }] }]]);
    let count = 0;
    eachPlaced({ id: 'start', prefab: 'me' }, loop, () => count++, 4);
    expect(count).toBe(5);
  });
});

describe('a placed record', () => {
  it('stands as the record with each override replacing a field whole', () => {
    const tom = { name: 'Tom', bag: [{ item: 'rope', count: 1 }], stats: { hp: 5, str: 2 } };
    expect(recordHere(tom, [{ name: 'Old Tom' }, { stats: { hp: 9 } }])).toEqual({
      name: 'Old Tom',
      bag: [{ item: 'rope', count: 1 }],
      stats: { hp: 9 },
    });
    expect(recordHere(undefined, [{ name: 'x' }])).toEqual({ name: 'x' });
  });
});
