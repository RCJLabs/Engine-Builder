import { describe, expect, it } from 'vitest';
import { GAME, HOLD } from '../test/scripts.ts';
import { checkScript } from './check.ts';
import { classifyScript } from './files.ts';
import { transpileScript } from './transpile.ts';

const problems = (source: string, scripts: readonly string[] = []) =>
  checkScript(source, new Set(scripts)).problems.map((p) => `${p.code} ${p.line}:${p.column ?? ''} ${p.message}`);

describe('transpiling', () => {
  it('strips the types and keeps every line where it was', () => {
    const out = transpileScript(HOLD);
    if (!out.ok) throw new Error(out.message);
    expect(out.js.split('\n')).toHaveLength(HOLD.split('\n').length);
    expect(out.js).not.toContain('interface Hold');
    expect(out.js).toContain("require('eb')");
    // The action's body is on the line it was written on.
    const line = (text: string, needle: string) => text.split('\n').findIndex((l) => l.includes(needle));
    expect(line(out.js, 'ctx.emit(')).toBe(line(HOLD, 'ctx.emit('));
  });

  it('says where it stopped, once', () => {
    expect(transpileScript('const a = 1;\nconst b = ;')).toEqual({
      ok: false,
      message: 'Unexpected token',
      line: 2,
      column: 11,
    });
  });
});

describe('checking a script', () => {
  it('passes a sound script, listing the scripts it imports', () => {
    expect(checkScript(GAME, new Set(['game', 'hold']))).toMatchObject({ imports: ['hold'], problems: [] });
    expect(checkScript(GAME, new Set(['game', 'hold'])).js).toContain("require('./hold')");
  });

  it('holds a script to the purity rules, at each line', () => {
    const source = [
      "import { defineModule } from 'eb';",
      '// Math.random in a comment is fine,',
      "const note = 'and Date in a string';",
      'const r = Math.random();',
      'const t = Date.now();',
      'const f = new Function("return 1");',
      'const g = fetch;',
    ].join('\n');
    expect(problems(source)).toEqual([
      'E029 4: no Math.random (use a seeded rng stream)',
      'E029 5: no Date (time arrives as actions)',
      'E029 6: no eval, Function or import() (code made at run time is code no rule has read)',
      'E029 7: no DOM or host globals',
    ]);
  });

  it('lets a script import "eb" and the project\'s other scripts only', () => {
    const source = [
      "import { defineModule } from 'eb';",
      "import { hold } from './hold';",
      "import { crew } from './crew.ts';",
      "import { z } from 'zod';",
      "import { gone } from './gone';",
      "import { up } from '../up';",
    ].join('\n');
    expect(problems(source, ['hold', 'crew'])).toEqual([
      'E030 4: Imports "zod": a script may import "eb" and other scripts ("./<name>")',
      'E030 5: Imports "./gone", which is no script here: scripts import each other as "./<name>"',
      'E030 6: Imports "../up": a script may import "eb" and other scripts ("./<name>")',
    ]);
    expect(checkScript(source, new Set(['hold', 'crew'])).imports).toEqual(['hold', 'crew']);
  });

  it('reports a script that does not parse, and still checks the rest of it', () => {
    expect(problems("const a = ;\nconst b = Math.random();\nimport { x } from 'y';")).toEqual([
      'E028 1:11 Unexpected token',
      'E029 2: no Math.random (use a seeded rng stream)',
      'E030 3: Imports "y": a script may import "eb" and other scripts ("./<name>")',
    ]);
    expect(checkScript('const a = ;', new Set()).js).toBeUndefined();
  });
});

describe('script files', () => {
  it('are scripts/<id>.ts; other .ts files there are misplaced, and the rest ignored', () => {
    expect(classifyScript('scripts/game.ts')).toEqual({ kind: 'script', id: 'game' });
    expect(classifyScript('scripts/raid-table.ts')).toEqual({ kind: 'script', id: 'raid-table' });
    expect(classifyScript('scripts/old/game.ts')).toMatchObject({ kind: 'misplaced' });
    expect(classifyScript('scripts/Hold.ts')).toMatchObject({
      kind: 'misplaced',
      reason: expect.stringContaining('"Hold" is not a valid script name'),
    });
    expect(classifyScript('scripts/eb.d.ts')).toEqual({ kind: 'ignored' });
    expect(classifyScript('scripts/notes.md')).toEqual({ kind: 'ignored' });
  });
});
