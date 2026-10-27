import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { NO_SCRIPTS, readGameState } from './gameState.ts';
import { checkJob } from './jobs.ts';
import { CHECK_MS, ScriptTimeout, type ScriptWorker } from './scriptWorker.ts';

const MODULE = `import { defineModule } from 'eb';
export const hold = defineModule({
  id: 'hold',
  init: () => ({ count: 0 }),
  actions: { loot: (ctx) => void (ctx.write().count = ctx.read().count + 1) },
  modes: { sea: { actions: ['hold/*'] } },
});`;
const GAME = "import { hold } from './hold';\nexport const modules = [hold];\nexport const start = 'sea';";

/** The worker's jobs run here, counting how often it is asked. */
function inProcess(): ScriptWorker & { asked: number } {
  const worker = {
    asked: 0,
    check: (files: Parameters<ScriptWorker['check']>[0], run: boolean) => {
      worker.asked++;
      return checkJob(files, run);
    },
    play: () => Promise.reject(new Error('not here')),
  };
  return worker;
}

const project = (files: Record<string, string>) => memorySource({ 'project.json': '{}', ...files });

describe('the open project’s game with spaces (M5.8)', () => {
  const walked = MODULE.replace("['hold/*']", "['hold/*', 'world/*']");

  it('joins the world module once the project has a space, which the check is told by name alone', async () => {
    const without = await readGameState(
      project({ 'scripts/hold.ts': walked, 'scripts/game.ts': GAME }),
      inProcess(),
      true,
    );
    expect(without.status).toBe('failed');
    expect(without.problems.map((p) => p.message)).toEqual(['Mode "sea" allows "world/*", which matches no action']);
    const files = { 'scripts/hold.ts': walked, 'scripts/game.ts': GAME, 'spaces/trailhead.json': '{ "objects": [] }' };
    const loaded = await readGameState(project(files), inProcess(), true);
    expect(loaded.status).toBe('loaded');
    expect(loaded.catalog?.actions).toContain('world/trigger');
  });
});

describe('the open project’s game', () => {
  it('is no scripts, without starting the worker, when there are none', async () => {
    const worker = inProcess();
    expect(await readGameState(project({}), worker, true)).toBe(NO_SCRIPTS);
    expect(worker.asked).toBe(0);
  });

  it('says why game.ts hasn’t run, or what it declares once it has', async () => {
    const status = async (files: Record<string, string>, run = true) =>
      (await readGameState(project(files), inProcess(), run)).status;
    expect(await status({ 'scripts/hold.ts': MODULE })).toBe('no-game');
    expect(await status({ 'scripts/game.ts': GAME, 'scripts/hold.ts': MODULE }, false)).toBe('untrusted');
    expect(await status({ 'scripts/game.ts': GAME, 'scripts/hold.ts': 'Math.random();' })).toBe('broken');
    expect(await status({ 'scripts/game.ts': `${GAME}\nthrow new Error('no');`, 'scripts/hold.ts': MODULE })).toBe(
      'failed',
    );
    const loaded = await readGameState(
      project({ 'scripts/game.ts': GAME, 'scripts/hold.ts': MODULE }),
      inProcess(),
      true,
    );
    expect(loaded).toMatchObject({ ids: ['game', 'hold'], status: 'loaded', problems: [] });
    expect(loaded.catalog?.actions).toEqual(['hold/loot']);
  });

  it('joins the kits project.json lists to the game its scripts make (M3.3)', async () => {
    const manifest = { format: 1, id: 'hold', name: 'Hold', version: '0.1.0', kits: ['inventory'] };
    const files = { 'project.json': JSON.stringify(manifest), 'scripts/game.ts': GAME, 'scripts/hold.ts': MODULE };
    const loaded = await readGameState(memorySource(files), inProcess(), true);
    expect(loaded.catalog?.modules).toEqual(['logic', 'flag', 'sheet', 'inventory', 'hold']);
    expect(loaded.catalog?.effects).toContain('give-item');
  });

  it('counts a game that never finishes loading as failed (E031)', async () => {
    const hung: ScriptWorker = {
      check: () => Promise.reject(new ScriptTimeout(CHECK_MS)),
      play: () => Promise.reject(new Error('not here')),
    };
    const state = await readGameState(
      project({ 'scripts/game.ts': 'while (true) {}', 'scripts/notes.md': '' }),
      hung,
      true,
    );
    expect(state).toEqual({
      ids: ['game'],
      status: 'failed',
      catalog: null,
      stages: [],
      problems: [
        {
          code: 'E031',
          severity: 'error',
          message: 'It didn’t finish loading within 5 seconds: does a loop never end?',
          file: 'scripts/game.ts',
          path: '',
        },
      ],
    });
  });
});
