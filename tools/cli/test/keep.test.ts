/**
 * eb with the keep (M7.1's gate, D83, docs/specs/2d-scenes.md#the-gate): a keep at night drawn from
 * the starter sprites, two guards on the wall walk and a bell on the gatehouse. eb validates it clean
 * and builds it as format 17, its sprites the starter kit's byte for byte; broken once for each new
 * check, it is E091 (a clip past its sheet, a component's clip its sprite lacks), E058 (a turn in 2D,
 * terrain in 2D, a sprite in 3D), and, made 3D, its walkers need the navmesh a 2D space doesn't.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const KEEP = resolve(import.meta.dirname, 'fixtures/keep');
const STARTER = resolve(import.meta.dirname, '../../../starter-sprites');

const compiled = (folder = KEEP) => compileWithGame(folderSource(folder));

// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, edited in place
async function edit(path: string, change: (value: any) => void): Promise<void> {
  const value = JSON.parse(await readFile(path, 'utf8'));
  change(value);
  await writeFile(path, JSON.stringify(value));
}

// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, edited in place
async function broken(file: string, change: (value: any) => void): Promise<string[]> {
  const folder = await mkdtemp(join(tmpdir(), 'keep-'));
  try {
    await cp(KEEP, folder, { recursive: true });
    await edit(join(folder, file), change);
    const { diagnostics } = await compiled(folder);
    return diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code} ${d.file ?? ''} ${d.path}`);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** The keep's object by id, in its space file. */
const object = (space: { objects: { id: string }[] }, id: string) =>
  space.objects.find((o) => o.id === id) as Record<string, unknown>;

/** Where an object sits in the keep's file, as a problem's path names it. */
const SPACE = JSON.parse(readFileSync(join(KEEP, 'spaces/keep.json'), 'utf8')) as { objects: { id: string }[] };
const at = (id: string) => `/objects/${SPACE.objects.findIndex((o) => o.id === id)}`;

describe('the keep', () => {
  it('validates clean and builds as format 17, with every sprite it draws and each sheet', async () => {
    const { pack, diagnostics } = await compiled();
    expect(diagnostics).toEqual([]);
    expect(pack?.format).toBe(17);
    const sprites = Object.keys(pack?.world?.records ?? {}).filter((key) => key.startsWith('sprite:'));
    // All but the keeper's and the villager's figures, whom the keep doesn't place.
    expect(sprites).toHaveLength(14);
    expect(Object.keys(pack?.world?.files ?? {})).toHaveLength(14);
    expect(pack?.world?.uses?.keep?.bell?.label).toBe('Ring the bell');
    expect(pack?.world?.actors).toEqual({
      aldo: { space: 'keep', path: 'aldo' },
      brun: { space: 'keep', path: 'brun' },
    });
  });

  it('draws the starter sprites as the kit writes them, byte for byte', () => {
    const sheets = join(STARTER, 'assets/starter-sprites');
    for (const name of readdirSync(sheets))
      expect(readFileSync(join(KEEP, 'assets/starter-sprites', name)), name).toEqual(readFileSync(join(sheets, name)));
    for (const name of readdirSync(join(STARTER, 'records/sprite')))
      expect(readFileSync(join(KEEP, 'records/sprite', name), 'utf8'), name).toBe(
        readFileSync(join(STARTER, 'records/sprite', name), 'utf8'),
      );
  });

  it('is E091 for a clip past its sheet, and for a component’s clip its sprite lacks', async () => {
    expect(
      await broken('records/sprite/torch.json', (torch) => {
        torch.clips.burn.frames = [0, 3];
      }),
    ).toEqual(['E091 records/sprite/torch.json /clips/burn/frames']);
    expect(
      await broken('spaces/keep.json', (space) => {
        (object(space, 'torch-1').components as { sprite: Record<string, unknown> }).sprite.clip = 'gutter';
      }),
    ).toEqual([`E091 spaces/keep.json ${at('torch-1')}/components/sprite/clip`]);
  });

  it('is E058 for what a 2D space doesn’t draw, and for a sprite in 3D', async () => {
    expect(
      await broken('spaces/keep.json', (space) => {
        object(space, 'bell').turn = [0, 0, 15];
      }),
    ).toEqual([`E058 spaces/keep.json ${at('bell')}/turn`]);
    expect(
      await broken('prefabs/curtain.json', (curtain) => {
        curtain.objects[0].shape = 'cylinder';
      }),
    ).toEqual([...Array(15).keys()].map((k) => `E058 spaces/keep.json ${at(`curtain-${k}`)}`).sort());
    expect(
      await broken('spaces/keep.json', (space) => {
        space.view = undefined;
        space.fit = undefined;
        space.size = undefined;
        space.backdrop = undefined;
      }),
    ).toContain(`E058 spaces/keep.json ${at('sky')}/components/sprite`);
  });

  it('needs no navmesh for its walkers while it is 2D, and one once it is 3D', async () => {
    const made3d = await broken('spaces/keep.json', (space) => {
      space.view = '3d';
      space.fit = undefined;
      space.size = undefined;
      space.backdrop = undefined;
    });
    // Its patrols and day posts walk, and a 3D space walks only on a navmesh.
    expect(made3d.filter((p) => p.startsWith('E079') || p.startsWith('E081'))).toEqual([
      'E081 records/behaviour/wall-east.json /do/first/0/do',
      'E081 records/behaviour/wall-east.json /do/first/1/do',
      'E081 records/behaviour/wall-west.json /do/first/0/do',
      'E081 records/behaviour/wall-west.json /do/first/1/do',
    ]);
  });
});
