import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { canonicalJson, readPack } from '@eb/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FIXTURE_TYPES, FIXTURE_V1, readFixture } from '../../../packages/compiler/test/fixture.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const V1_HASH = '489cedf323bd33d9';

/** Runs `eb` in `cwd` and returns its exit code and output. */
function eb(args: readonly string[], cwd = tmpdir()) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

const scratch = () => mkdtempSync(join(tmpdir(), 'eb-cli-'));

/** A copy of the v1 fixture in a scratch folder, with files changed or added. */
function project(changes: Record<string, string> = {}): string {
  const dir = scratch();
  cpSync(FIXTURE_V1, dir, { recursive: true });
  for (const [path, content] of Object.entries(changes)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

describe('eb validate', () => {
  it('passes the v1 fixture and prints its hash', () => {
    const run = eb(['validate', FIXTURE_V1, '--types', FIXTURE_TYPES]);
    expect(run).toEqual({ code: 0, out: `4 records: no problems, hash ${V1_HASH}.\n`, err: '' });
  });

  it('fails on errors, prints each one, and never enters hidden folders', () => {
    const dir = project({
      'records/item/medkit.json': '{ "name": "Medkit", "weight": "light" }',
      'records/item/notes.md': 'Medkits heal 2.',
      'records/.trash/medkit.json': '{',
      '.git/records/item/x.json': '{',
    });
    const run = eb(['validate', dir, '--types', FIXTURE_TYPES]);
    expect(run.code).toBe(1);
    expect(run.out).toBe(
      [
        'records/item/medkit.json#/weight: error E001: Invalid input: expected number, received string',
        'records/item/notes.md: warning W101: Ignored: record files are records/<type>/<id>.json',
        '4 records: 1 error, 1 warning.',
        '',
      ].join('\n'),
    );
  });

  it('passes with only warnings', () => {
    const run = eb(['validate', project({ 'records/item/notes.md': '' }), '--types', FIXTURE_TYPES]);
    expect(run.code).toBe(0);
    expect(run.out).toContain(`4 records: 1 warning, hash ${V1_HASH}.`);
  });

  it('says so when no record types were given', () => {
    const run = eb(['validate', FIXTURE_V1]);
    expect(run.code).toBe(1);
    expect(run.out).toContain('No record types were given, so every record is unknown. Pass --types <module>.');
  });

  it('reads a zip of the project to the same hash', () => {
    const zip = join(scratch(), 'salvage-run.zip');
    const files = readFixture(FIXTURE_V1);
    writeFileSync(
      zip,
      zipSync(Object.fromEntries(Object.entries(files).map(([p, t]) => [`salvage-run/${p}`, strToU8(t)]))),
    );
    expect(eb(['validate', zip, '--types', FIXTURE_TYPES]).out).toBe(`4 records: no problems, hash ${V1_HASH}.\n`);
  });

  it('prints JSON for machines', () => {
    const run = eb(['validate', project({ 'project.json': '{ "format": 2 }' }), '--types', FIXTURE_TYPES, '--json']);
    expect(run.code).toBe(1);
    const report = JSON.parse(run.out);
    expect(report).toMatchObject({ ok: false, records: 4, hash: null, out: null });
    expect(report.diagnostics).toEqual([
      {
        code: 'E009',
        severity: 'error',
        message: 'This project is format 2; this engine reads formats up to 1. Update the engine.',
        file: 'project.json',
        path: '/format',
      },
    ]);
  });
});

describe('eb build', () => {
  it('writes the pack as canonical JSON to --out', () => {
    const out = join(scratch(), 'dist/packs/salvage-run.pack.json');
    const run = eb(['build', FIXTURE_V1, '--types', FIXTURE_TYPES, '--out', out]);
    expect(run.code).toBe(0);
    expect(run.out).toBe(`4 records: no problems, hash ${V1_HASH}.\nWrote ${out}.\n`);
    const text = readFileSync(out, 'utf8');
    const pack = readPack(JSON.parse(text));
    expect(pack.hash).toBe(V1_HASH);
    expect(text).toBe(`${canonicalJson(pack)}\n`);
  });

  it('names the pack after the project by default', () => {
    const cwd = scratch();
    expect(eb(['build', FIXTURE_V1, '--types', FIXTURE_TYPES, '--json'], cwd).code).toBe(0);
    expect(readPack(JSON.parse(readFileSync(join(cwd, 'salvage-run.pack.json'), 'utf8'))).hash).toBe(V1_HASH);
  });

  it('writes nothing when the project has errors', () => {
    const cwd = scratch();
    const run = eb(['build', project({ 'records/item/medkit.json': '{' }), '--types', FIXTURE_TYPES], cwd);
    expect(run.code).toBe(1);
    expect(existsSync(join(cwd, 'salvage-run.pack.json'))).toBe(false);
  });
});

describe('usage errors', () => {
  const notZip = join(scratch(), 'notes.txt');
  writeFileSync(notZip, 'not a zip');
  const badTypes = join(scratch(), 'types.mjs');
  writeFileSync(badTypes, 'export const recordTypes = [{ type: "item" }];');

  it.each([
    ['no arguments', [], 'Usage:'],
    ['an unknown command', ['check', FIXTURE_V1], 'Usage:'],
    ['an extra argument', ['validate', FIXTURE_V1, 'more'], 'Usage:'],
    ['an unknown option', ['validate', FIXTURE_V1, '--strict'], "Unknown option '--strict'"],
    ['--out on validate', ['validate', FIXTURE_V1, '--out', 'x.json'], '--out only applies to eb build'],
    ['a missing project', ['validate', join(tmpdir(), 'no-such-project')], 'is neither a project folder nor a zip'],
    ['a file that is not a zip', ['validate', notZip], 'is not a zip: invalid zip data'],
    [
      'a types module that is missing',
      ['validate', FIXTURE_V1, '--types', 'nope.ts'],
      'Could not load --types nope.ts',
    ],
    ['a types module of the wrong shape', ['validate', FIXTURE_V1, '--types', badTypes], 'must export recordTypes'],
  ])('exit 2 for %s', (_name, args, message) => {
    const run = eb(args);
    expect(run.code).toBe(2);
    expect(run.out).toBe('');
    expect(run.err).toContain(message);
  });
});
