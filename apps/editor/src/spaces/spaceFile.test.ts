import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import {
  addObject,
  changeObject,
  changeSpaceFile,
  createSpaceFile,
  deleteObjects,
  groupObjects,
  placeObjects,
  renameObject,
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
      problem: '/objects/0: An object is a shape or a placed prefab: give it one',
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
