/**
 * The boarding deck (M7.2's gate, D84, docs/specs/tilemaps.md#the-gate): Space-Wrecked's example ship
 * as a 2D space's tilemap, from the starter tileset, validated clean and built as format 18 with its
 * cells, edges and places; broken once for each new check, it is E092 (a tile's joins past the sheet,
 * a character two tiles share), E093 (a character no tile is, a row too long, edges in the wrong
 * place, a second tilemap), E058 (a tilemap in 3D) and W157 (a crew member on a crate).
 */
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const DECK = resolve(import.meta.dirname, 'fixtures/deck');
const STARTER = resolve(import.meta.dirname, '../../../starter-sprites');

const compiled = (folder = DECK) => compileWithGame(folderSource(folder));

// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, edited in place
async function edit(path: string, change: (value: any) => void): Promise<void> {
  const value = JSON.parse(await readFile(path, 'utf8'));
  change(value);
  await writeFile(path, JSON.stringify(value));
}

/** The deck's problems once `file` is changed, warnings too, as code, file and path. */
// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, edited in place
async function broken(file: string, change: (value: any) => void): Promise<string[]> {
  const folder = await mkdtemp(join(tmpdir(), 'deck-'));
  try {
    await cp(DECK, folder, { recursive: true });
    await edit(join(folder, file), change);
    const { diagnostics } = await compiled(folder);
    return diagnostics.map((d) => `${d.code} ${d.file ?? ''} ${d.path}`);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

const SPACE = JSON.parse(readFileSync(join(DECK, 'spaces/deck.json'), 'utf8')) as { objects: { id: string }[] };
const at = (id: string) => `/objects/${SPACE.objects.findIndex((o) => o.id === id)}`;
// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, edited in place
const object = (space: { objects: { id: string }[] }, id: string): any => space.objects.find((o) => o.id === id);

describe('the deck', () => {
  it('validates clean and builds as format 18, its ship’s cells, edges and places packed', async () => {
    const { pack, diagnostics } = await compiled();
    expect(diagnostics).toEqual([]);
    expect(pack?.format).toBe(18);
    const tiles = pack?.world?.tiles?.deck;
    expect(tiles?.object).toBe('deck');
    expect(tiles?.size).toEqual([11, 5]);
    expect(tiles?.tile).toEqual([16, 16]);
    // Space-Wrecked's rules by its characters: floor and airlock walk, crates and consoles give half
    // cover, a locker, machinery and the hull full cover and block sight.
    expect(tiles?.cells).toEqual(
      ['00044111100', '0a11111a114', '0a111111111', '0a1a1114a14', '0a1'].map((r) => r.padEnd(11, '0')),
    );
    expect(tiles?.places).toMatchObject({ bridge: [9, 1], engines: [2, 1], hold: [5, 0], hatch: [5, 3], ines: [9, 1] });
    expect(Object.keys(pack?.world?.records ?? {}).sort()).toEqual([
      'actor:ines',
      'actor:oren',
      'sprite:figure-guard',
      'sprite:figure-keeper',
      'sprite:sky-stars',
      'tileset:deck',
    ]);
    expect(Object.keys(pack?.world?.files ?? {}).sort()).toEqual([
      'assets/starter-sprites/deck-tiles.png',
      'assets/starter-sprites/figure-guard.png',
      'assets/starter-sprites/figure-keeper.png',
      'assets/starter-sprites/sky-stars.png',
    ]);
  });

  it('draws the starter tileset and sprites as the kit writes them, byte for byte', () => {
    for (const name of ['deck-tiles.png', 'figure-guard.png', 'figure-keeper.png', 'sky-stars.png'])
      expect(readFileSync(join(DECK, 'assets/starter-sprites', name)), name).toEqual(
        readFileSync(join(STARTER, 'assets/starter-sprites', name)),
      );
    expect(readFileSync(join(DECK, 'records/tileset/deck.json'), 'utf8')).toBe(
      readFileSync(join(STARTER, 'records/tileset/deck.json'), 'utf8'),
    );
  });

  it('is E092 for joins that run past the sheet, and a character two tiles share', async () => {
    expect(
      await broken('records/tileset/deck.json', (tileset) => {
        tileset.tiles.hull.frame = 50;
      }),
    ).toEqual(['E092 records/tileset/deck.json /tiles/hull/frame']);
    expect(
      await broken('records/tileset/deck.json', (tileset) => {
        tileset.tiles.locker.char = 'h';
      }),
    ).toEqual([
      'E092 records/tileset/deck.json /tiles/locker/char',
      // Its H is then no tile at all, where the engine room's locker stands.
      `E093 spaces/deck.json ${at('deck')}/components/tilemap/layers/0/rows/3`,
    ]);
  });

  it('is E093 for a character no tile is, a row too long, an edge on a tile, and a second tilemap', async () => {
    const map = `${at('deck')}/components/tilemap`;
    expect(
      await broken('spaces/deck.json', (space) => {
        const rows = object(space, 'deck').components.tilemap.layers[0].rows;
        rows[2] = ' #...?.....';
        rows[4] = ' #..........';
        object(space, 'deck').components.tilemap.edges[1] = '      I-    /     I    ';
      }),
    ).toEqual([
      `E093 spaces/deck.json ${map}/edges/1`,
      `E093 spaces/deck.json ${map}/layers/0/rows/2`,
      `E093 spaces/deck.json ${map}/layers/0/rows/4`,
    ]);
    expect(
      await broken('spaces/deck.json', (space) => {
        space.objects.push({ ...object(space, 'deck'), id: 'galley' });
      }),
    ).toEqual([`E093 spaces/deck.json /objects/${SPACE.objects.length}/components/tilemap`]);
  });

  it('is E058 for a tilemap in a 3D space', async () => {
    const made3d = await broken('spaces/deck.json', (space) => {
      space.view = undefined;
      space.fit = undefined;
      space.size = undefined;
      space.backdrop = undefined;
    });
    expect(made3d).toContain(`E058 spaces/deck.json ${at('deck')}/components/tilemap`);
  });

  it('is W157 for a crew member placed on a crate, and off the map', async () => {
    expect(
      await broken('spaces/deck.json', (space) => {
        // The hold's crate at (3, 0), and a little left of the map.
        object(space, 'ines').at = [16 + 3 * 16 + 8, 16 + 4 * 16 + 8, 3];
        object(space, 'oren').at = [8, 40, 3];
      }),
    ).toEqual([`W157 spaces/deck.json ${at('ines')}/at`, `W157 spaces/deck.json ${at('oren')}/at`]);
  });
});
