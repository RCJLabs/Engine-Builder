/**
 * eb with a project's own game (M3.2, D38): scripts/game.ts checked, run, and played, with no
 * --types or --game. The hold fixture is a small game written as scripts.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readPack } from '@eb/core';
import { describe, expect, it } from 'vitest';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const HOLD = resolve(import.meta.dirname, 'fixtures/hold');
const DOOR = resolve(import.meta.dirname, 'fixtures/door');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

/** A copy of the hold, files changed, added or (with null) removed. */
function hold(changes: Record<string, string | null> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'eb-hold-'));
  cpSync(HOLD, dir, { recursive: true });
  for (const [path, content] of Object.entries(changes)) {
    if (content === null) rmSync(join(dir, path));
    else writeFileSync(join(dir, path), content);
  }
  return dir;
}

const sheet = (row: object) => JSON.stringify({ rows: [{ id: 'r', when: { event: 'hold/looted' }, do: [], ...row }] });

describe('eb validate with scripts/game.ts', () => {
  it('checks content against the game the scripts make', () => {
    const run = eb(['validate', HOLD]);
    expect(run.code).toBe(0);
    expect(run.out).toMatch(/^2 records: no problems, hash [0-9a-f]{16}\.\n$/);
  });

  it('refuses an event, fact or effect the game lacks; without game.ts each is taken as written', () => {
    const odd = {
      'records/sheet/odd.json': sheet({ when: { event: 'hold/sunk' }, if: 'hold.depth > 1', do: [{ effect: 'bail' }] }),
    };
    const run = eb(['validate', hold(odd)]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      'records/sheet/odd.json#/rows/0/when/event: error E022: No event "hold/sunk" in this game',
    );
    expect(run.out).toContain('records/sheet/odd.json#/rows/0/if: error E012');
    expect(run.out).toContain('records/sheet/odd.json#/rows/0/do/0/effect: error E025: No effect "bail" in this game');

    const open = eb(['validate', hold({ ...odd, 'scripts/game.ts': null })]);
    expect(open.out).not.toContain('error E022');
    expect(open.out).toContain('scripts/hold.ts: warning W112: There is no scripts/game.ts, so nothing runs it');
  });

  it('reports a game that throws as it loads (E031), at its line', () => {
    const game =
      "import { hold } from './hold';\nexport const modules = [hold];\nexport const start = 'sea';\nthrow new Error('the hold is flooded');";
    const run = eb(['validate', hold({ 'scripts/game.ts': game })]);
    expect(run.code).toBe(1);
    expect(run.out).toContain('scripts/game.ts:4: error E031: It threw as it loaded: the hold is flooded');
    expect(run.out).toMatch(/2 records: 1 error\.\n$/);
  });

  it('reports a script that breaks a purity rule (E029), and plays nothing', () => {
    const impure = readFileSync(join(HOLD, 'scripts/hold.ts'), 'utf8').replace(
      "ctx.rng('loot').int(1, 3)",
      'Math.floor(Math.random() * 3) + 1',
    );
    const dir = hold({ 'scripts/hold.ts': impure });
    const run = eb(['validate', dir]);
    expect(run.code).toBe(1);
    expect(run.out).toContain('scripts/hold.ts:15: error E029: no Math.random (use a seeded rng stream)');
    const sim = eb(['sim', dir, '--seeds', '5']);
    expect(sim.code).toBe(1);
    expect(sim.out).toContain('scripts/hold.ts:15: error E029');
  });
});

describe('eb sim with scripts/game.ts', () => {
  it('plays the game with its own bots and metrics', () => {
    const run = eb(['sim', HOLD, '--seeds', '20', '--policy', 'greedy', '--json']);
    expect(run.code).toBe(0);
    const out = JSON.parse(run.out);
    expect(out).toMatchObject({ ok: true, project: 'hold', report: { runs: 20, refused: { count: 0 } } });
    expect(out.report.ends.ended).toBe(20);
    expect(out.report.metrics.map((m: { label: string }) => m.label)).toEqual(['hold.count']);
  });

  it('needs --game, or a project with scripts/game.ts', () => {
    const run = eb(['sim', DOOR]);
    expect(run.code).toBe(2);
    expect(run.err).toContain('eb sim needs --game <module>, or a project with scripts/game.ts');
  });
});

describe('eb build with scripts', () => {
  it('writes a format 2 pack carrying the scripts game.ts reaches', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'eb-pack-')), 'hold.pack.json');
    expect(eb(['build', HOLD, '--out', out]).code).toBe(0);
    const pack = readPack(JSON.parse(readFileSync(out, 'utf8')));
    expect(pack.format).toBe(2);
    expect(Object.keys(pack.scripts ?? {})).toEqual(['game', 'hold']);
  });
});
