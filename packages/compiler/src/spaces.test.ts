/** Spaces and prefabs (M5.1, D63): their shape, ids, placements and the files' places. */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';
import { classifySpaceFile } from './spaceFiles.ts';
import { checkProjectSpaces, checkSpaces, readSpaces, type SpaceFileRead } from './spaces.ts';

const space = (id: string, objects: unknown[], kind: 'space' | 'prefab' = 'space'): SpaceFileRead => ({
  file: `${kind === 'space' ? 'spaces' : 'prefabs'}/${id}.json`,
  kind,
  id,
  value: { name: id, objects },
});
const prefab = (id: string, objects: unknown[]) => space(id, objects, 'prefab');
const box = { id: 'box', shape: 'box' };
const codes = (files: SpaceFileRead[]) => checkSpaces(files).map((d) => `${d.code} ${d.file} ${d.path} ${d.message}`);

describe('a space or a prefab', () => {
  it('passes shapes and placements, at, turn, scale, colour and name set or left out', () => {
    const yard = space('yard', [
      { id: 'ground', shape: 'plane', scale: [20, 1, 20], color: '#7A8b5c' },
      { id: 'crate-1', name: 'A crate', prefab: 'crate', at: [2, 0, -1], turn: [0, 30, 0] },
    ]);
    expect(codes([yard, prefab('crate', [box])])).toEqual([]);
  });

  it('is E058 for what its shape refuses, at the field', () => {
    const odd = (object: object) => codes([space('yard', [object]), prefab('crate', [box])]);
    expect(odd({ ...box, size: 2 })).toEqual(['E058 spaces/yard.json /objects/0/size Unknown field "size"']);
    expect(odd({ ...box, scale: [1, 0, 1] })).toEqual(['E058 spaces/yard.json /objects/0/scale/1 A scale is above 0']);
    expect(odd({ ...box, prefab: 'crate' })).toEqual([
      'E058 spaces/yard.json /objects/0/prefab An object is a shape or a placed prefab, not both',
    ]);
    expect(odd({ id: 'nothing' })).toEqual([
      'E058 spaces/yard.json /objects/0 An object is a shape or a placed prefab: give it one',
    ]);
    expect(odd({ id: 'c', prefab: 'crate', color: '#ffffff' })).toEqual([
      'E058 spaces/yard.json /objects/0/color A placed prefab takes its colours from the prefab',
    ]);
    expect(odd({ ...box, color: 'red' })[0]).toMatch(/^E058 spaces\/yard\.json \/objects\/0\/color Expected a colour/);
    expect(odd({ ...box, id: 'Box 1' })[0]).toMatch(/^E058 spaces\/yard\.json \/objects\/0\/id Not an id/);
    expect(odd({ ...box, turn: [0, 90] })[0]).toMatch(/^E058 spaces\/yard\.json \/objects\/0\/turn /);
    expect(codes([{ ...space('yard', []), value: { objects: [] } }])).toEqual([
      'E058 spaces/yard.json /name Missing field "name"',
    ]);
  });

  it('is E059 for an id used twice in one file, but not across files', () => {
    expect(codes([space('yard', [box, { ...box, at: [1, 0, 0] }]), space('hut', [box])])).toEqual([
      'E059 spaces/yard.json /objects/1/id Another object is already "box"',
    ]);
  });

  it('is E060 for a placement of a prefab prefabs/ lacks, and not for a space of that id', () => {
    expect(codes([space('yard', [{ id: 'c', prefab: 'hut' }]), space('hut', [box])])).toEqual([
      'E060 spaces/yard.json /objects/0/prefab No prefab "hut" in prefabs/',
    ]);
  });

  it('is E061 at every placement that leads a prefab back to itself', () => {
    expect(codes([prefab('crate', [{ id: 'me', prefab: 'crate' }])])).toEqual([
      'E061 prefabs/crate.json /objects/0/prefab The prefab "crate" places itself',
    ]);
    const loop = [
      prefab('a', [box, { id: 'b', prefab: 'b' }]),
      prefab('b', [{ id: 'c', prefab: 'c' }]),
      prefab('c', [{ id: 'a', prefab: 'a' }]),
      prefab('d', [{ id: 'a', prefab: 'a' }]),
    ];
    expect(codes(loop)).toEqual([
      'E061 prefabs/a.json /objects/1/prefab The prefab "a" places itself through "b"',
      'E061 prefabs/b.json /objects/0/prefab The prefab "b" places itself through "c"',
      'E061 prefabs/c.json /objects/0/prefab The prefab "c" places itself through "a"',
    ]);
    // A prefab placed twice is no loop.
    expect(
      codes([
        prefab('pair', [
          { id: 'one', prefab: 'crate' },
          { id: 'two', prefab: 'crate' },
        ]),
        prefab('crate', [box]),
      ]),
    ).toEqual([]);
  });

  it('places each problem at its line and column', () => {
    const text =
      '{\n  "name": "Yard",\n  "objects": [\n    { "id": "box", "shape": "box", "scale": [1, 0, 1] }\n  ]\n}\n';
    const [found] = checkProjectSpaces([
      { file: 'spaces/yard.json', kind: 'space', id: 'yard', value: JSON.parse(text), text },
    ]);
    expect(found).toMatchObject({ code: 'E058', path: '/objects/0/scale/1', line: 4 });
  });
});

describe('the files under spaces/ and prefabs/', () => {
  it('are spaces and prefabs by their names, and W141 in a folder or not named by an id', () => {
    expect(classifySpaceFile('spaces/yard.json')).toEqual({ kind: 'space', id: 'yard' });
    expect(classifySpaceFile('prefabs/crate.json')).toEqual({ kind: 'prefab', id: 'crate' });
    expect(classifySpaceFile('spaces/notes.txt')).toEqual({ kind: 'ignored' });
    expect(classifySpaceFile('spaces/old/yard.json').kind).toBe('misplaced');
    expect(classifySpaceFile('prefabs/Big Crate.json').kind).toBe('misplaced');
  });

  it('are read for eb validate: E007 for one that isn’t JSON, W141 for one out of place', async () => {
    const source = memorySource({
      'project.json': '{ "format": 1, "id": "yard", "name": "Yard", "version": "0.1.0" }',
      'spaces/yard.json': JSON.stringify({ name: 'Yard', objects: [{ id: 'c', prefab: 'barrel' }] }),
      'spaces/broken.json': '{ "name": ',
      'prefabs/crate.json': JSON.stringify({ name: 'Crate', objects: [box] }),
      'spaces/hut.json': JSON.stringify({ name: 'Hut', objects: [{ id: 'c', prefab: 'crate' }] }),
      'spaces/old/yard.json': '{}',
    });
    const read = await readSpaces(source);
    // Read in the order of their paths, whatever order the source lists them in.
    expect(read.files.map((f) => f.file)).toEqual([
      'prefabs/crate.json',
      'spaces/broken.json',
      'spaces/hut.json',
      'spaces/yard.json',
    ]);
    const result = await compileProject(source, []);
    expect(result.diagnostics.map((d) => `${d.code} ${d.file}`)).toEqual([
      'E007 spaces/broken.json',
      'W141 spaces/old/yard.json',
      'E060 spaces/yard.json',
    ]);
    expect(result.pack).toBeNull();
  });
});
