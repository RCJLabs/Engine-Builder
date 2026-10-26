import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import {
  addObject,
  changeObject,
  changeSpaceFile,
  createSpaceFile,
  deleteObjects,
  freeSpot,
  groupObjects,
  placeObjects,
  places,
  renameObject,
  setAxis,
} from './spaceEdits.ts';
import { changeSpaceText, freeId, readSpace, type SpaceJson, spaceText, withTransform } from './spaceFile.ts';

const yard: SpaceJson = {
  name: 'The yard',
  objects: [
    { id: 'ground', shape: 'plane', scale: [20, 1, 20], color: '#7a8b5c' },
    { id: 'crate-1', prefab: 'crate', at: [2, 0, -1], turn: [0, 30, 0] },
  ],
};

const YARD_TEXT = `{
  "name": "The yard",
  "objects": [
    { "id": "ground", "shape": "plane", "scale": [20, 1, 20], "color": "#7a8b5c" },
    { "id": "crate-1", "prefab": "crate", "at": [2, 0, -1], "turn": [0, 30, 0] }
  ]
}
`;

describe('a space’s file', () => {
  it('is written one object to a line, its fields in order', () => {
    expect(spaceText(yard)).toBe(YARD_TEXT);
    expect(spaceText({ name: 'Empty', objects: [] })).toBe('{\n  "name": "Empty",\n  "objects": []\n}\n');
    // Fields out of order come back in order.
    const shuffled = {
      name: 'X',
      objects: [{ color: '#ffffff', shape: 'box' as const, id: 'a', at: [1, 2, 3] as [number, number, number] }],
    };
    expect(spaceText(shuffled)).toContain('{ "id": "a", "shape": "box", "at": [1, 2, 3], "color": "#ffffff" }');
    // A terrain's settings sit on one line between the name and the objects (M5.3), and read back.
    const terrain = { size: 65, spacing: 1, low: 0, high: 10, layers: [{ name: 'Grass', color: '#5f8f3e' }] };
    const fell = spaceText({ name: 'Fell', terrain, objects: [] });
    expect(fell).toBe(`{\n  "name": "Fell",\n  "terrain": ${JSON.stringify(terrain)},\n  "objects": []\n}\n`);
    expect(readSpace(fell)).toEqual({ ok: true, space: { name: 'Fell', terrain, objects: [] } });
    // The environment's id after the name, before the terrain, wherever the space had it (M5.4).
    const dusk = spaceText({ terrain, objects: [], environment: 'dusk', name: 'Fell' });
    expect(dusk).toBe(
      `{\n  "name": "Fell",\n  "environment": "dusk",\n  "terrain": ${JSON.stringify(terrain)},\n  "objects": []\n}\n`,
    );
    expect(readSpace(dusk)).toEqual({ ok: true, space: { name: 'Fell', environment: 'dusk', terrain, objects: [] } });
  });

  it('keeps its line ends, indent and last newline, and stays byte for byte when nothing changes', () => {
    const windows = YARD_TEXT.replaceAll('\n', '\r\n').replaceAll('  ', '\t');
    expect(changeSpaceText(windows, (s) => s)).toBe(windows);
    const moved = changeSpaceText(windows, (s) =>
      placeObjects(s, new Map([['crate-1', { at: [3, 0, -1], turn: [0, 30, 0], scale: [1, 1, 1] }]])),
    );
    expect(moved).toContain('\r\n\t\t{ "id": "crate-1", "prefab": "crate", "at": [3, 0, -1], "turn": [0, 30, 0] }\r\n');
    // One line of the file changed.
    const lines = (text: string) => text.split('\r\n');
    const changed = lines(moved ?? '').filter((line, i) => line !== lines(windows)[i]);
    expect(changed).toHaveLength(1);
    expect(changeSpaceText('{ "name": "x" }', (s) => s)).toBeNull();
    // Laid out by hand: left as it is until an edit changes the space, then written one object a line.
    const byHand =
      '{"name":"The yard","objects":[\n  {"id":"ground","shape":"plane","scale":[20,1,20],"color":"#7a8b5c"},\n  {"id":"crate-1","prefab":"crate","at":[2,0,-1],"turn":[0,30,0]}]}\n';
    expect(changeSpaceText(byHand, (s) => s)).toBe(byHand);
    expect(changeSpaceText(byHand, (s) => renameObject(s, 'ground', 'Field'))).toContain(
      '{ "id": "ground", "name": "Field", "shape": "plane"',
    );
  });

  it('leaves out fields at their defaults', () => {
    expect(
      withTransform({ id: 'a', shape: 'box', at: [1, 0, 0] }, { at: [0, 0, 0], turn: [0, 0, 0], scale: [1, 1, 1] }),
    ).toEqual({
      id: 'a',
      shape: 'box',
    });
    expect(
      withTransform({ id: 'a', shape: 'box' }, { at: [0.1 + 0.2, 0, 0], turn: [0, 0, 0], scale: [2, 2, 2] }),
    ).toEqual({
      id: 'a',
      shape: 'box',
      at: [0.3, 0, 0],
      scale: [2, 2, 2],
    });
  });

  it('is read as a space, or says its first problem', () => {
    expect(readSpace(YARD_TEXT)).toEqual({ ok: true, space: yard });
    expect(readSpace('{ "name": ')).toMatchObject({ ok: false, problem: expect.stringMatching(/^It isn’t JSON/) });
    expect(readSpace('{ "name": "x", "objects": [{ "id": "a" }] }')).toEqual({
      ok: false,
      problem: '/objects/0: An object is a shape, a placed prefab or a placed record: give it one',
    });
  });

  it('names a new object by a free id', () => {
    expect(freeId(new Set(['box', 'box-2']), 'box')).toBe('box-3');
    expect(freeId(new Set(), 'box')).toBe('box');
  });
});

describe('the Scene panel’s edits', () => {
  it('add, change, rename and delete objects', () => {
    const added = addObject(yard, { id: 'ground', shape: 'box' });
    expect(added.id).toBe('ground-2');
    expect(added.space.objects.at(-1)).toEqual({ id: 'ground-2', shape: 'box' });
    expect(changeObject(yard, 'ground', { color: undefined, shape: 'box' }).objects[0]).toEqual({
      id: 'ground',
      shape: 'box',
      scale: [20, 1, 20],
    });
    expect(renameObject(yard, 'ground', '  The field ').objects[0]?.name).toBe('The field');
    expect(renameObject(renameObject(yard, 'ground', 'x'), 'ground', 'ground').objects[0]).not.toHaveProperty('name');
    expect(deleteObjects(yard, new Set(['ground'])).objects.map((o) => o.id)).toEqual(['crate-1']);
  });

  it('sets one axis against the file as it is when the edit lands, so x, y and z typed fast all stick', () => {
    // Each written from the same render, as an object's form's three boxes are when typed faster than
    // it redraws: each keeps the axes the edits before it set.
    const spawn: SpaceJson = {
      name: 'Forge',
      objects: [{ id: 'spawn', shape: 'box', at: [1.5, 0, 0], scale: [2, 1, 2] }],
    };
    const x = setAxis(spawn, 'spawn', 'at', 0, 0);
    const y = setAxis(x, 'spawn', 'at', 1, 0.5);
    const z = setAxis(y, 'spawn', 'scale', 2, 0.5);
    expect(z.objects[0]).toEqual({ id: 'spawn', shape: 'box', at: [0, 0.5, 0], scale: [2, 1, 0.5] });
    // At the origin and back to one, the file leaves them out, as a whole transform written does.
    expect(setAxis(setAxis(x, 'spawn', 'scale', 0, 1), 'spawn', 'scale', 2, 1).objects[0]).toEqual({
      id: 'spawn',
      shape: 'box',
    });
    expect(setAxis(spawn, 'other', 'at', 0, 9)).toEqual(spawn);
  });

  it('group objects into a prefab around their centre, on the ground, placed where they were', () => {
    const space: SpaceJson = {
      name: 'Yard',
      objects: [
        { id: 'lamp', shape: 'cylinder' },
        { id: 'a', prefab: 'crate', at: [1, 0, 2] },
        { id: 'b', prefab: 'crate', at: [3, 1, 2], turn: [0, 45, 0] },
        { id: 'stack', shape: 'box' },
      ],
    };
    const grouped = groupObjects(space, new Set(['a', 'b']), { id: 'stack', name: 'Stack' });
    expect(grouped.placement).toBe('stack-2');
    expect(grouped.space.objects).toEqual([
      { id: 'lamp', shape: 'cylinder' },
      { id: 'stack-2', prefab: 'stack', at: [2, 0, 2] },
      { id: 'stack', shape: 'box' },
    ]);
    expect(grouped.prefab).toEqual({
      name: 'Stack',
      objects: [
        { id: 'a', prefab: 'crate', at: [-1, 0, 0] },
        { id: 'b', prefab: 'crate', at: [1, 1, 0], turn: [0, 45, 0] },
      ],
    });
  });

  it('put a new object on a free spot, 1.5 m along x from the middle of the view', () => {
    expect(freeSpot({ name: 'Empty', objects: [] }, 2, -1)).toEqual([2, 0, -1]);
    const taken: SpaceJson = {
      name: 'Row',
      objects: [
        { id: 'a', shape: 'box', at: [0, 0, 0] },
        { id: 'b', shape: 'box', at: [1.5, 2, 0.2] },
        { id: 'c', shape: 'box', at: [3, 0, 1] },
      ],
    };
    expect(freeSpot(taken, 0, 0)).toEqual([3, 0, 0]);
    expect(freeSpot(taken, 0.6, 0)).toEqual([0.6, 0, 0]);
  });

  it('know which prefabs place another, themselves or through others, so Add never offers a loop', () => {
    const prefabs = new Map<string, SpaceJson>([
      ['crate', { name: 'Crate', objects: [{ id: 'box', shape: 'box' }] }],
      ['pair', { name: 'Pair', objects: [{ id: 'one', prefab: 'crate' }] }],
      ['stack', { name: 'Stack', objects: [{ id: 'p', prefab: 'pair' }] }],
    ]);
    expect(places(prefabs, 'stack', 'crate')).toBe(true);
    expect(places(prefabs, 'pair', 'pair')).toBe(true);
    expect(places(prefabs, 'crate', 'stack')).toBe(false);
    expect(places(prefabs, 'missing', 'crate')).toBe(false);
  });

  it('make file changes, none for a file that stays the same', async () => {
    const source = memorySource({ 'spaces/yard.json': YARD_TEXT });
    expect(await changeSpaceFile(source, 'spaces/yard.json', (s) => s)).toEqual([]);
    expect(await changeSpaceFile(source, 'spaces/none.json', (s) => s)).toEqual([]);
    const [change] = await changeSpaceFile(source, 'spaces/yard.json', (s) => deleteObjects(s, new Set(['ground'])));
    expect(new TextDecoder().decode(change?.after ?? new Uint8Array())).not.toContain('ground');
    expect(await createSpaceFile(source, 'spaces/yard.json', yard)).toEqual([]);
    const [made] = await createSpaceFile(source, 'prefabs/crate.json', { name: 'Crate', objects: [] });
    expect(made).toMatchObject({ path: 'prefabs/crate.json', before: null });
  });
});
