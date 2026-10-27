/**
 * The tower (M7.3's gate, D85, docs/specs/rooms.md#the-gate): the keep seen side on as a 2D space's
 * building, from the starter rooms, validated clean and built as format 19 with its rooms, stairs and
 * places; broken once for each new check, it is E094 (two rooms on one slot, a stair from the top floor,
 * a second building), E058 (a building in 3D) and W158 (floors no stair reaches).
 */
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const TOWER = resolve(import.meta.dirname, 'fixtures/tower');
const STARTER = resolve(import.meta.dirname, '../../../starter-sprites');

const compiled = (folder = TOWER) => compileWithGame(folderSource(folder));

// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, edited in place
async function edit(path: string, change: (value: any) => void): Promise<void> {
  const value = JSON.parse(await readFile(path, 'utf8'));
  change(value);
  await writeFile(path, JSON.stringify(value));
}

/** The tower's problems once `file` is changed, warnings too, as code, file and path. */
// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, edited in place
async function broken(file: string, change: (value: any) => void): Promise<string[]> {
  const folder = await mkdtemp(join(tmpdir(), 'tower-'));
  try {
    await cp(TOWER, folder, { recursive: true });
    await edit(join(folder, file), change);
    const { diagnostics } = await compiled(folder);
    return diagnostics.map((d) => `${d.code} ${d.file ?? ''} ${d.path}`);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

const SPACE = JSON.parse(readFileSync(join(TOWER, 'spaces/tower.json'), 'utf8')) as { objects: { id: string }[] };
const at = (id: string) => `/objects/${SPACE.objects.findIndex((o) => o.id === id)}`;
// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, edited in place
const object = (space: { objects: { id: string }[] }, id: string): any => space.objects.find((o) => o.id === id);
const ROOMS = ['barracks', 'chapel', 'crypt', 'hall', 'store', 'watch'];

describe('the tower', () => {
  it('validates clean and builds as format 19, its rooms, stairs and places packed', async () => {
    const { pack, diagnostics } = await compiled();
    expect(diagnostics).toEqual([]);
    expect(pack?.format).toBe(19);
    const tower = pack?.world?.buildings?.tower;
    expect(tower).toMatchObject({ object: 'tower', at: [112, 16], slot: [48, 32], slots: 2, floors: 4, climb: 32 });
    expect(tower?.rooms).toEqual({
      barracks: [2, 0, 1],
      chapel: [2, 1, 1],
      crypt: [0, 0, 1],
      hall: [1, 0, 2],
      store: [0, 1, 1],
      watch: [3, 0, 2],
    });
    expect(tower?.stairs).toEqual([
      [0, 12],
      [1, 84],
      [2, 12],
    ]);
    // Each mark and each walker on the floor its feet are on; the bell and the ground are off it.
    expect(tower?.places).toMatchObject({
      crypt: [0, 28],
      chapel: [2, 72],
      'hall-a': [1, 30],
      'watch-b': [3, 70],
      wynn: [2, 72],
      edda: [2, 30],
      hal: [3, 70],
    });
    expect(tower?.places).not.toHaveProperty('bell');
    const records = Object.keys(pack?.world?.records ?? {});
    expect(records.filter((k) => k.startsWith('room:')).sort()).toEqual(ROOMS.map((r) => `room:${r}`));
    expect(records).toEqual(expect.arrayContaining([...ROOMS.map((r) => `sprite:room-${r}`), 'sprite:ladder']));
    expect(Object.keys(pack?.world?.files ?? {})).toEqual(
      expect.arrayContaining([
        ...ROOMS.map((r) => `assets/starter-sprites/room-${r}.png`),
        'assets/starter-sprites/ladder.png',
      ]),
    );
  });

  it('draws the starter rooms as the kit writes them, byte for byte', () => {
    for (const name of [...ROOMS.map((r) => `room-${r}`), 'ladder', 'figure-guard', 'figure-keeper', 'bell'])
      expect(readFileSync(join(TOWER, 'assets/starter-sprites', `${name}.png`)), name).toEqual(
        readFileSync(join(STARTER, 'assets/starter-sprites', `${name}.png`)),
      );
    for (const room of ROOMS)
      expect(readFileSync(join(TOWER, `records/room/${room}.json`), 'utf8')).toBe(
        readFileSync(join(STARTER, `records/room/${room}.json`), 'utf8'),
      );
  });

  it('is E094 for two rooms on one slot, a stair from the top floor, and a second building', async () => {
    const building = `${at('tower')}/components/building`;
    expect(
      await broken('spaces/tower.json', (space) => {
        const tower = object(space, 'tower').components.building;
        tower.rooms[1].slot = 0;
        tower.stairs[2].floor = 3;
      }),
    ).toEqual([
      `E094 spaces/tower.json ${building}/rooms/1`,
      // The watch room, on the top floor, is then reached by no stair.
      `W158 spaces/tower.json ${building}/stairs`,
      `E094 spaces/tower.json ${building}/stairs/2/floor`,
    ]);
    expect(
      await broken('spaces/tower.json', (space) => {
        space.objects.push({ ...object(space, 'tower'), id: 'annexe', at: [240, 16, 0] });
      }),
    ).toEqual([`E094 spaces/tower.json /objects/${SPACE.objects.length}/components/building`]);
  });

  it('is E058 for a building in a 3D space', async () => {
    const problems = await broken('spaces/tower.json', (space) => {
      delete space.view;
      delete space.fit;
      delete space.size;
      delete space.backdrop;
    });
    expect(problems).toContain(`E058 spaces/tower.json ${at('tower')}/components/building`);
  });

  it('is W158 for each floor with a room no stair reaches from the ground', async () => {
    expect(
      await broken('spaces/tower.json', (space) => {
        object(space, 'tower').components.building.stairs.splice(1, 1);
      }),
    ).toEqual([
      `W158 spaces/tower.json ${at('tower')}/components/building/stairs`,
      `W158 spaces/tower.json ${at('tower')}/components/building/stairs`,
    ]);
  });
});
