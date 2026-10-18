import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkJob, playJob, policyNames } from './jobs.ts';
import type { SentFile } from './protocol.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');
const HOLD = join(ROOT, 'tools/cli/test/fixtures/hold');
const CLI = join(ROOT, 'tools/cli/src/cli.ts');

/** A folder's files as the page sends them, paths from its root. */
function folderFiles(dir: string): SentFile[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(dir, path).split('\\').join('/'), new Uint8Array(readFileSync(path))] as const;
    });
}

const hold = (changes: Record<string, string> = {}): SentFile[] => {
  const files = new Map(folderFiles(HOLD));
  for (const [path, text] of Object.entries(changes)) files.set(path, new TextEncoder().encode(text));
  return [...files];
};
const scripts = (files: SentFile[]) => files.filter(([path]) => path.startsWith('scripts/'));
const brief = (diagnostics: readonly { code: string; file?: string; line?: number }[]) =>
  diagnostics.map((d) => `${d.code} ${d.file}${d.line ? `:${d.line}` : ''}`);

describe('checking scripts in the worker', () => {
  it('reads them as the compiler does, and runs game.ts only when asked', async () => {
    const unrun = await checkJob(scripts(hold()), false);
    expect(unrun).toEqual({ ids: ['game', 'hold'], hasGame: true, diagnostics: [], ran: false, game: null });
    const run = await checkJob(scripts(hold()), true);
    expect(run.ran).toBe(true);
    expect(run.game?.modules).toEqual(['logic', 'flag', 'sheet', 'hold']);
    expect(run.game?.events['hold/looted']).toMatchObject({ label: 'The crew loots' });
    expect(run.game && policyNames(run.game)).toEqual(['random', 'greedy']);
  });

  it('says where game.ts threw as it loaded (E031)', async () => {
    const game = "import { hold } from './hold';\nexport const modules = [hold];\n\nthrow new Error('flooded');";
    const run = await checkJob(scripts(hold({ 'scripts/game.ts': game })), true);
    expect(run.game).toBeNull();
    expect(brief(run.diagnostics)).toEqual(['E031 scripts/game.ts:4']);
  });

  it('runs nothing when a script game.ts reaches breaks a rule', async () => {
    const impure = new TextDecoder()
      .decode(readFileSync(join(HOLD, 'scripts/hold.ts')))
      .replace("ctx.rng('loot').int(1, 3)", 'Math.floor(Math.random() * 3) + 1');
    const run = await checkJob(scripts(hold({ 'scripts/hold.ts': impure })), true);
    expect(run.ran).toBe(false);
    expect(brief(run.diagnostics)).toEqual(['E029 scripts/hold.ts:15']);
  });
});

describe('Run in the worker', () => {
  it('plays the game as eb sim does, line for line', async () => {
    const played = await playJob(hold(), 20, 'greedy');
    const cli = spawnSync(process.execPath, [CLI, 'sim', HOLD, '--seeds', '20', '--policy', 'greedy'], {
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(played).toEqual({ kind: 'played', ok: true, lines: cli.stdout.trimEnd().split('\n') });
  });

  it('plays nothing while the project has errors, and says which', async () => {
    const sheet = JSON.stringify({ rows: [{ id: 'r', when: { event: 'hold/sunk' }, do: [] }] });
    const played = await playJob(hold({ 'records/sheet/odd.json': sheet }), 20, 'random');
    expect(played.kind).toBe('refused');
    expect(played.kind === 'refused' && brief(played.errors)).toEqual(['E022 records/sheet/odd.json']);
  });

  it('names the bots there are when asked for another', async () => {
    await expect(playJob(hold(), 5, 'lazy')).rejects.toThrow('No bot "lazy": this game has random, greedy');
  });
});
