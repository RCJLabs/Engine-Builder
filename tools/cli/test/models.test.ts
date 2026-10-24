/**
 * eb with models (M5.5, D67): the workshop, a crate from the starter kit, hills whose geometry is
 * Draco, a sign whose texture is a KTX2, a material on the crate's slot, LOD levels, a box, a hull
 * and a capsule, and a prop type whose records are drawn as a model, all placed in a yard. eb
 * validates it clean, and a copy broken once for each of M5.5's checks gives each at its file
 * and field.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const WORKSHOP = resolve(import.meta.dirname, 'fixtures/workshop');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

/** Each problem eb printed as "code file#pointer". */
const problems = (out: string) =>
  out
    .trim()
    .split('\n')
    .slice(0, -1)
    .map((line) => {
      const [, file, pointer, code] = /^([^:#]+)(?::\d+)?(#[^:]*)?: \w+ (\w\d+):/.exec(line) ?? [];
      return `${code} ${file}${pointer ?? ''}`;
    });

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe('eb with models', () => {
  it('validates the workshop clean', () => {
    const run = eb(['validate', WORKSHOP]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out.trim()).toMatch(/^5 records: no problems, hash [0-9a-f]{16}\.$/);
  });

  it('gives each of M5.5’s checks at its file and field', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'eb-workshop-')), 'workshop');
    cpSync(WORKSHOP, dir, { recursive: true });
    const edit = (path: string, change: (value: Record<string, unknown>) => void) => {
      const value = JSON.parse(readFileSync(join(dir, path), 'utf8'));
      change(value);
      writeFileSync(join(dir, path), json(value));
    };
    // The sign drawn from a glTF 1 file, with a capsule and no radius; the hills' LOD levels the
    // wrong way round; and the crate given a slot its file has no material of.
    writeFileSync(join(dir, 'assets/models/old.gltf'), json({ asset: { version: '1.0' } }));
    edit('assets/assets.json', (log) => {
      (log.files as Record<string, unknown>)['models/old.gltf'] = {
        licence: 'own',
        source: 'Written by hand to be old',
        date: '2026-10-24',
      };
    });
    edit('records/model/sign.json', (sign) => {
      sign.file = 'models/old.gltf';
      delete (sign.collider as Record<string, unknown>).radius;
    });
    edit('records/model/hills.json', (hills) => {
      hills.lod = [
        { ratio: 0.25, from: 30 },
        { ratio: 0.5, from: 15 },
      ];
    });
    edit('records/model/crate.json', (crate) => {
      (crate.materials as unknown[]).push({ slot: 'cloth', material: 'oak' });
    });
    const run = eb(['validate', dir]);
    expect(run.code).toBe(1);
    expect(problems(run.out)).toEqual([
      'W146 records/model/crate.json#/materials/1/slot',
      'E071 records/model/hills.json#/lod/1/from',
      'E071 records/model/hills.json#/lod/1/ratio',
      'E072 records/model/sign.json#/collider/radius',
      'E070 records/model/sign.json#/file',
    ]);
    for (const words of [
      'The file has no material “cloth”: it has “wood”, “metal”',
      'Level 2 starts at 15 m, not beyond level 1’s 30 m',
      'A capsule needs its radius',
      'It is glTF 1.0: the engine reads glTF 2.0',
    ]) {
      expect(run.out).toContain(words);
    }
  });
});
