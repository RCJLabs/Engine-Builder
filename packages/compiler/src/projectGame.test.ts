import { describe, expect, it } from 'vitest';
import { GAME, HOLD } from '../../script/test/scripts.ts';
import { compileWithGame, gameOptions, memorySource, projectGame } from './index.ts';

const MANIFEST = JSON.stringify({ format: 1, id: 'hold', name: 'Hold', version: '0.1.0' });
const project = (scripts: Record<string, string>) => memorySource({ 'project.json': MANIFEST, ...scripts });

describe("a project's own game", () => {
  it('is none without game.ts, and broken, run not at all, while a script it reaches has an error', async () => {
    expect(await projectGame(project({ 'scripts/hold.ts': HOLD }))).toEqual({ kind: 'none' });
    const impure = { 'scripts/game.ts': GAME, 'scripts/hold.ts': `${HOLD}\nexport const at = Date.now();` };
    expect(await projectGame(project(impure))).toEqual({ kind: 'broken' });
    // The compiler's E029 says so; nothing ran, so there is no E031 beside it.
    const { diagnostics, pack } = await compileWithGame(project(impure));
    expect(diagnostics.map((d) => d.code)).toEqual(['E029']);
    expect(pack).toBeNull();
  });

  it('fails at its script and line (E031), and a project whose game fails packs nothing', async () => {
    const game = `${GAME}\nthrow new Error('no crew');`;
    const failed = await projectGame(project({ 'scripts/game.ts': game, 'scripts/hold.ts': HOLD }));
    expect(failed).toEqual({
      kind: 'failed',
      diagnostic: {
        code: 'E031',
        severity: 'error',
        message: 'It threw as it loaded: no crew',
        file: 'scripts/game.ts',
        path: '',
        // GAME's seven lines and the blank one after them.
        line: 9,
      },
    });
    const compiled = await compileWithGame(project({ 'scripts/game.ts': game, 'scripts/hold.ts': HOLD }));
    expect(compiled.diagnostics.map((d) => d.code)).toEqual(['E031']);
    expect(compiled.pack).toBeNull();
  });

  it('checks content against what it declares once it loads, and packs its scripts', async () => {
    const loaded = await projectGame(project({ 'scripts/game.ts': GAME, 'scripts/hold.ts': HOLD }));
    if (loaded.kind !== 'loaded') throw new Error(`not loaded: ${loaded.kind}`);
    const options = gameOptions(loaded.catalog);
    expect(Object.keys(options.facts ?? {})).toContain('hold.count');
    expect(Object.keys(options.events ?? {})).toContain('hold/looted');
    expect(options.effectNames).toEqual(['add-to-flag', 'roll', 'set-flag', 'stash']);
    const compiled = await compileWithGame(project({ 'scripts/game.ts': GAME, 'scripts/hold.ts': HOLD }));
    expect(compiled.diagnostics).toEqual([]);
    expect(Object.keys(compiled.pack?.scripts ?? {})).toEqual(['game', 'hold']);
  });

  it('lists its modes, and among them the ones that allow no action, where it ends (M4.4)', async () => {
    const ending = HOLD.replace(
      "modes: { play: { actions: ['*'] } },",
      "modes: { play: { actions: ['*'] }, ashore: { actions: [] } },",
    );
    const loaded = await projectGame(project({ 'scripts/game.ts': GAME, 'scripts/hold.ts': ending }));
    if (loaded.kind !== 'loaded') throw new Error(`not loaded: ${loaded.kind}`);
    expect(loaded.catalog.modes).toEqual(['ashore', 'play']);
    expect(loaded.catalog.endings).toEqual(['ashore']);
  });
});
