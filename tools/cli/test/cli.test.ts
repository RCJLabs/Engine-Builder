import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { canonicalJson, readPack } from '@eb/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  EVENT_TYPES,
  FIXTURE_LUDUS,
  FIXTURE_TYPES,
  FIXTURE_V1,
  readFixture,
} from '../../../packages/compiler/test/fixture.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const SALVAGE = resolve(import.meta.dirname, '../../../packages/core/test/fixtures/salvage-run');
const SALVAGE_GAME = resolve(import.meta.dirname, 'fixtures/salvage-game.ts');
const V1_HASH = '489cedf323bd33d9';
const LUDUS_HASH = '34035cc3fb5fba7a';

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

  it('says where types come from when records are of types nobody defined', () => {
    const run = eb(['validate', FIXTURE_V1]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      'Some records are of types neither types/ nor a --types module defines. Pass --types <module>, or add types/<type>.json.',
    );
  });

  it('passes a project made only of data with no --types module (D31)', () => {
    const run = eb(['validate', FIXTURE_LUDUS]);
    expect(run).toEqual({ code: 0, out: `8 records: no problems, hash ${LUDUS_HASH}.\n`, err: '' });
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

  it("checks conditions against the types module's facts", () => {
    const event = (when: unknown) => JSON.stringify({ choices: { go: { when, effects: [] } } });
    const never = eb([
      'validate',
      project({ 'records/event/a.json': event({ fact: 'hold.credits', op: '<', value: 0 }) }),
      '--types',
      EVENT_TYPES,
    ]);
    expect(never.code).toBe(0);
    expect(never.out).toContain(
      'records/event/a.json#/choices/go/when: warning W102: This condition is never true, whatever its facts hold',
    );
    const unknown = eb([
      'validate',
      project({ 'records/event/a.json': event({ fact: 'hold.debt' }) }),
      '--types',
      EVENT_TYPES,
    ]);
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain('records/event/a.json#/choices/go/when/fact: error E012: No fact "hold.debt"');
  });

  it("checks rows against the types module's events and effects, and takes them as written without one (D36)", () => {
    const salvage = () => {
      const dir = scratch();
      cpSync(SALVAGE, dir, { recursive: true });
      const row = { id: 'typo', when: { event: 'voyage/arived' }, do: [{ effect: 'lot', table: 'dead-hauler' }] };
      writeFileSync(join(dir, 'records/sheet/typos.json'), JSON.stringify({ rows: [row] }));
      return dir;
    };
    const typed = eb(['validate', salvage(), '--types', SALVAGE_GAME]);
    expect(typed.code).toBe(1);
    expect(typed.out).toContain(
      'records/sheet/typos.json#/rows/0/when/event: error E022: No event "voyage/arived" in this game',
    );
    expect(typed.out).toContain(
      'records/sheet/typos.json#/rows/0/do/0/effect: error E025: No effect "lot" in this game',
    );
    // Without --types, a game's own names can't be told from typos: taken as written.
    const open = eb(['validate', salvage()]);
    expect(open.out).not.toContain('E022');
    expect(open.out).not.toContain('E025');
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

  it('writes conditions written as text into the pack as trees', () => {
    const out = join(scratch(), 'ludus.pack.json');
    expect(eb(['build', FIXTURE_LUDUS, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(pack.hash).toBe(LUDUS_HASH);
    const spiculus = pack.records.gladiator?.spiculus as { fights: unknown } | undefined;
    expect(spiculus?.fights).toEqual({
      all: [{ fact: 'arena.day' }, { not: { fact: 'crowd.angry' } }],
    });
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
  const badFacts = join(scratch(), 'facts.mjs');
  writeFileSync(badFacts, 'export const recordTypes = []; export const facts = ["hold.count"];');

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
    ['facts that are not a catalog', ['validate', FIXTURE_V1, '--types', badFacts], 'which must be a fact catalog'],
  ])('exit 2 for %s', (_name, args, message) => {
    const run = eb(args);
    expect(run.code).toBe(2);
    expect(run.out).toBe('');
    expect(run.err).toContain(message);
  });
});
