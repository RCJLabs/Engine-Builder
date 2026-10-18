import {
  calendarOf,
  dateAt,
  defineModule,
  engineModules,
  flagModule,
  formatRef,
  isRecordId,
  logicModule,
  type Module,
  parseRef,
  randomPolicy,
  rulePolicy,
  sheetModule,
  ticksOf,
  timeModule,
  turnFor,
  weightedPolicy,
} from '@eb/core';
import { describe, expect, it } from 'vitest';
import { compiled, GAME, HOLD } from '../test/scripts.ts';
import { EB_MODULE } from './api.ts';
import { loadScripts, ScriptError, scriptLocation } from './load.ts';
import { loadProjectGame } from './project.ts';

describe('loading scripts', () => {
  it('runs the entry and what it imports, with "eb" the engine API', () => {
    const exports = loadScripts(compiled({ game: GAME, hold: HOLD }), 'game');
    expect(exports.start).toBe('play');
    expect((exports.modules as Module[]).map((m) => m.id)).toEqual(['hold']);
  });

  it('gives a script imported while it runs what it has exported so far, as Node does', () => {
    const a = "import { b } from './b';\nexport const a = 'a';\nexport const seen = b;";
    const b = "import * as fromA from './a';\nexport const b = 'b';\nexport const early = fromA.a;";
    const exports = loadScripts(compiled({ a, b }), 'a');
    expect(exports.seen).toBe('b');
    expect(loadScripts(compiled({ a, b }), 'b').early).toBe('a');
  });

  it('says which script threw as it loaded, and at which line', () => {
    const hold = "export const x = 1;\n\nthrow new Error('the hold is flooded');";
    const fail = () =>
      loadScripts(compiled({ game: "import { x } from './hold';\nexport const y = x;", hold }), 'game');
    expect(fail).toThrow(ScriptError);
    expect(fail).toThrow('the hold is flooded');
    try {
      fail();
    } catch (error) {
      expect(error).toMatchObject({ script: 'hold', line: 3 });
    }
  });

  it('finds the script and line of an error thrown later, from its stack', () => {
    const exports = loadScripts(compiled({ game: 'export const f = () => {\n  return (null as any).x;\n};' }), 'game');
    try {
      (exports.f as () => unknown)();
      throw new Error('should have thrown');
    } catch (error) {
      expect(scriptLocation(error)).toEqual({ script: 'game', line: 2 });
    }
    expect(scriptLocation(new Error('elsewhere'))).toBeUndefined();
  });

  it('refuses an import the check would have refused', () => {
    expect(() => loadScripts(new Map([['game', "require('node:fs');"]]), 'game')).toThrow(
      'A script may import "eb" and other scripts, not "node:fs"',
    );
    expect(() => loadScripts(new Map(), 'game')).toThrow('There is no script scripts/game.ts');
  });
});

describe('the "eb" module', () => {
  it("is the sim API a script may use, each the engine's own, and nothing else", () => {
    expect(Object.keys(EB_MODULE)).toEqual([
      'defineModule',
      'engineModules',
      'logicModule',
      'flagModule',
      'sheetModule',
      'timeModule',
      'randomPolicy',
      'weightedPolicy',
      'rulePolicy',
      'turnFor',
      'isRecordId',
      'parseRef',
      'formatRef',
      'calendarOf',
      'dateAt',
      'ticksOf',
    ]);
    // toEqual compares functions by identity: each is the engine's own, not a copy.
    expect(EB_MODULE).toEqual({
      defineModule,
      engineModules,
      logicModule,
      flagModule,
      sheetModule,
      timeModule,
      randomPolicy,
      weightedPolicy,
      rulePolicy,
      turnFor,
      isRecordId,
      parseRef,
      formatRef,
      calendarOf,
      dateAt,
      ticksOf,
    });
    expect(Object.isFrozen(EB_MODULE)).toBe(true);
  });
});

describe("a project's game", () => {
  it("is game.ts's exports, the engine's modules first, with a catalogue of plain data", () => {
    const loaded = loadProjectGame(compiled({ game: GAME, hold: HOLD }));
    if (!loaded.ok) throw new Error(loaded.problem.message);
    const { catalog } = loaded;
    expect(catalog.modules).toEqual(['logic', 'flag', 'sheet', 'hold']);
    expect(catalog.start).toBe('play');
    expect(catalog.facts['hold.count']).toEqual({ domain: { type: 'int', min: 0 }, label: 'items held' });
    expect(Object.keys(catalog.facts)).toEqual(expect.arrayContaining(['flag.on', 'flag.number', 'hold.count']));
    expect(catalog.events['hold/looted']).toEqual({
      args: { count: { type: 'int', min: 0 } },
      label: 'Something is looted',
    });
    expect(catalog.effects).toEqual(['add-to-flag', 'roll', 'set-flag', 'stash']);
    expect(catalog.actions).toEqual(['hold/loot']);
    expect(catalog.policies).toEqual(['greedy']);
    // It crosses from the script worker to the page.
    expect(structuredClone(catalog)).toEqual(catalog);
    expect(loaded.game.metrics).toEqual(['hold.count']);
  });

  it('keeps an engine module where the game places it', () => {
    const game =
      "import { sheetModule } from 'eb';\nimport { hold } from './hold';\nexport const modules = [hold, sheetModule];\nexport const start = 'play';";
    const loaded = loadProjectGame(compiled({ game, hold: HOLD }));
    expect(loaded.ok && loaded.catalog.modules).toEqual(['logic', 'flag', 'hold', 'sheet']);
  });

  it('says what game.ts lacks (E032), and what making the game refused (E031)', () => {
    const load = (game: string) => {
      const out = loadProjectGame(compiled({ game, hold: HOLD }));
      return out.ok ? 'ok' : `${out.problem.code} ${out.problem.message}`;
    };
    expect(load("export const start = 'play';")).toBe(
      'E032 scripts/game.ts must export modules: a list of modules made by defineModule',
    );
    expect(load("import { hold } from './hold';\nexport const modules = [hold];")).toBe(
      'E032 scripts/game.ts must export start: the mode a new game starts in',
    );
    expect(
      load(
        "import { hold } from './hold';\nexport const modules = [hold];\nexport const start = 'play';\nexport const policies = ['greedy'];",
      ),
    ).toBe('E032 scripts/game.ts must export policies, if any: policies such as weightedPolicy(…)');
    expect(load("import { hold } from './hold';\nexport const modules = [hold];\nexport const start = 'sail';")).toBe(
      'E031 The start mode "sail" is not registered',
    );
    expect(
      load("import { hold } from './hold';\nexport const modules = [hold, hold];\nexport const start = 'play';"),
    ).toMatch(/^E031 .*hold/);
  });

  it('says where a script threw as the game loaded (E031)', () => {
    const out = loadProjectGame(compiled({ game: "export const modules = [];\n\nthrow new Error('no crew');" }));
    expect(out).toEqual({
      ok: false,
      problem: { code: 'E031', message: 'It threw as it loaded: no crew', script: 'game', line: 3 },
    });
  });
});
