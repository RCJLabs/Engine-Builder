/**
 * The moor, M5.10's gate (D72, docs/specs/streaming.md#the-gate): the committed fixture is what its
 * generator makes, byte for byte; it validates clean; it builds as format 10 with its zone and its
 * chest; and it is as wide and as full as the gate needs. Change either by hand and this fails;
 * run `pnpm make:moor` to write it again.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileWithGame, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { CAIRN_Z, CHEST, makeMoor, SIZE, SPACING } from './fixtures/moor.ts';

const MOOR = resolve(import.meta.dirname, 'fixtures/moor');

const listed = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listed(join(folder, entry.name)) : [join(folder, entry.name)],
  );

const committed = () =>
  Object.fromEntries(
    listed(MOOR).map((path) => [relative(MOOR, path).split('\\').join('/'), new Uint8Array(readFileSync(path))]),
  );

describe('the moor', () => {
  it('is what its generator makes, byte for byte', () => {
    const made = makeMoor();
    const files = committed();
    expect(Object.keys(files).sort()).toEqual(made.map((file) => file.path));
    for (const file of made) expect(files[file.path], file.path).toEqual(file.bytes);
  });

  it('validates clean and builds as format 10, its cairn’s zone and its chest in the world', async () => {
    const compiled = await compileWithGame(memorySource(committed()));
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.pack?.format).toBe(10);
    const world = compiled.pack?.world;
    expect(Object.keys(world?.triggers.moor ?? {})).toEqual(['cairn-zone']);
    expect(Object.keys(world?.uses?.moor ?? {})).toEqual(['chest']);
  }, 60_000);

  it('is a kilometre across, with over a thousand objects spread over every cell', () => {
    const space = JSON.parse(new TextDecoder().decode(committed()['spaces/moor.json'])) as {
      terrain: { size: number; spacing: number };
      objects: { id: string; at?: [number, number, number] }[];
    };
    expect((space.terrain.size - 1) * space.terrain.spacing).toBe((SIZE - 1) * SPACING);
    expect((SIZE - 1) * SPACING).toBe(1024);
    expect(space.objects.length).toBeGreaterThan(1000);
    const cells = new Set(
      space.objects.map((o) => `${Math.floor((o.at?.[0] ?? 0) / 64)},${Math.floor((o.at?.[2] ?? 0) / 64)}`),
    );
    expect(cells.size).toBe(256);
    const chest = space.objects.find((o) => o.id === 'chest');
    expect([chest?.at?.[0], chest?.at?.[2]]).toEqual([CHEST[0], CHEST[1]]);
    expect(space.objects.find((o) => o.id === 'cairn-zone')?.at?.[2]).toBe(CAIRN_Z);
  });
});
