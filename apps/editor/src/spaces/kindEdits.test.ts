/** A project's component kinds changed in the type designer (M5.2, D64): every component of the kind follows. */
import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { addFieldChange, removeFieldChange, renameFieldChange } from '../types/fieldEdits.ts';
import { changeKind, createKindFile, deleteKind, mapComponents, renameKind, renameKindIn } from './kindEdits.ts';
import type { SpaceJson } from './spaceFile.ts';

const hold = { title: 'Hold', fields: { grade: { kind: 'text' }, holds: { kind: 'int', optional: true } } };
const wall: SpaceJson = {
  name: 'Wall',
  objects: [
    { id: 'jug', shape: 'sphere', components: { hold: { grade: '5a', holds: 2 } } },
    { id: 'crimp', shape: 'box', components: { hold: { grade: '6c' }, light: {} } },
  ],
};
const crag: SpaceJson = {
  name: 'Crag',
  objects: [
    { id: 'face', prefab: 'wall', overrides: { jug: { components: { hold: { grade: '5b' } } } } },
    { id: 'rock', shape: 'box', scale: [3, 1, 3] },
  ],
};
const text = (space: unknown) => `${JSON.stringify(space, null, 2)}\n`;
const project = () =>
  memorySource({
    'components/hold.json': text(hold),
    'prefabs/wall.json': text(wall),
    'spaces/crag.json': text(crag),
  });
const after = (changes: { path: string; after: Uint8Array | null }[], path: string) => {
  const found = changes.find((c) => c.path === path);
  return found?.after ? JSON.parse(new TextDecoder().decode(found.after)) : undefined;
};

describe('a kind’s components', () => {
  it('are each `components`, an object’s own whole and an override’s a part, prefabs inside included', () => {
    const seen: [unknown, boolean][] = [];
    mapComponents(crag, new Map([['wall', wall]]), (components, whole) => {
      seen.push([components, whole]);
      return components;
    });
    expect(seen).toEqual([[{ hold: { grade: '5b' } }, false]]);
    // A kind renamed; one left with nothing takes `components` out.
    expect(mapComponents(wall, new Map(), renameKindIn('hold', 'grip')).objects[1]?.components).toEqual({
      grip: { grade: '6c' },
      light: {},
    });
    expect(mapComponents(wall, new Map(), () => undefined).objects[0]).toEqual({ id: 'jug', shape: 'sphere' });
  });
});

describe('a kind changed', () => {
  it('renames a field in its file and in every component of it, overrides too', async () => {
    const changes = await changeKind(project(), 'hold', renameFieldChange([], 'grade', 'level'));
    expect(changes.map((c) => c.path).sort()).toEqual([
      'components/hold.json',
      'prefabs/wall.json',
      'spaces/crag.json',
    ]);
    expect(after(changes, 'components/hold.json').fields.level).toEqual({ kind: 'text' });
    expect(after(changes, 'prefabs/wall.json').objects[1].components.hold).toEqual({ level: '6c' });
    expect(after(changes, 'spaces/crag.json').objects[0].overrides.jug.components.hold).toEqual({ level: '5b' });
  });

  it('fills a required field in an object’s own component, never in an override’s', async () => {
    const changes = await changeKind(
      project(),
      'hold',
      addFieldChange([], 'face', { kind: 'text' }, { value: 'slab' }),
    );
    expect(after(changes, 'prefabs/wall.json').objects[1].components.hold).toEqual({ grade: '6c', face: 'slab' });
    expect(changes.some((c) => c.path === 'spaces/crag.json')).toBe(false);
  });

  it('takes a field out of every component, and refuses a rename onto one a component holds', async () => {
    const changes = await changeKind(project(), 'hold', removeFieldChange([], 'holds'));
    expect(after(changes, 'prefabs/wall.json').objects[0].components.hold).toEqual({ grade: '5a' });
    await expect(changeKind(project(), 'hold', renameFieldChange([], 'grade', 'holds'))).rejects.toThrow(
      /holds “holds” already/,
    );
  });

  it('is made, renamed and deleted with its components', async () => {
    expect((await createKindFile(project(), 'grip', 'Grip'))[0]?.path).toBe('components/grip.json');
    await expect(createKindFile(project(), 'hold', 'Hold')).rejects.toThrow('exists already');
    const renamed = await renameKind(project(), 'hold', 'grip');
    expect(renamed.map((c) => `${c.after ? '+' : '-'}${c.path}`).sort()).toEqual([
      '+components/grip.json',
      '+prefabs/wall.json',
      '+spaces/crag.json',
      '-components/hold.json',
    ]);
    expect(after(renamed, 'spaces/crag.json').objects[0].overrides.jug.components).toEqual({ grip: { grade: '5b' } });
    const gone = await deleteKind(project(), 'hold');
    expect(after(gone, 'prefabs/wall.json').objects[0]).toEqual({ id: 'jug', shape: 'sphere' });
    // An override left with nothing in it goes, and the overrides with it.
    expect(after(gone, 'spaces/crag.json').objects[0]).toEqual({ id: 'face', prefab: 'wall' });
  });
});
