/**
 * A project's stages (M7.4, D86, docs/specs/stages.md): where stage files sit and what their
 * imports name, the stage rules (transcendental Math and ** allowed, Math.random, the DOM and self
 * not), and a stage loaded with "eb/stage" given, its errors at their file and line.
 */
import { describe, expect, it } from 'vitest';
import { asStageError, loadStage, StageError, stageImport } from './stageLoad.ts';
import { checkStage, classifyStage } from './stages.ts';
import { transpileScript } from './transpile.ts';

const js = (source: string): string => {
  const out = transpileScript(source);
  if (!out.ok) throw new Error(out.message);
  return out.js;
};

describe('stage files', () => {
  it('sit under stages/, in folders if they like, each name an id', () => {
    expect(classifyStage('stages/battle.ts')).toEqual({ kind: 'stage', file: 'battle' });
    expect(classifyStage('stages/space-wrecked/painter.ts')).toEqual({ kind: 'stage', file: 'space-wrecked/painter' });
    expect(classifyStage('stages/notes.md')).toEqual({ kind: 'ignored' });
    expect(classifyStage('stages/types.d.ts')).toEqual({ kind: 'ignored' });
    expect(classifyStage('stages/battleView.ts')).toMatchObject({ kind: 'misplaced' });
    expect(classifyStage('stages/Space/painter.ts')).toMatchObject({ kind: 'misplaced' });
  });

  it('import each other by relative paths that stay under stages/', () => {
    expect(stageImport('battle', './space-wrecked/painter')).toBe('space-wrecked/painter');
    expect(stageImport('space-wrecked/painter', './orbit.ts')).toBe('space-wrecked/orbit');
    expect(stageImport('space-wrecked/figures/shapes', '../palette')).toBe('space-wrecked/palette');
    expect(stageImport('space-wrecked/painter', '../battle')).toBe('battle');
    expect(stageImport('battle', '../scripts/game')).toBeUndefined();
    expect(stageImport('battle', 'three')).toBeUndefined();
  });
});

describe('the stage rules', () => {
  const files = new Set(['battle', 'space-wrecked/orbit']);

  it('allow what a picture needs: transcendental Math, ** and eb/stage', () => {
    const source = [
      "import { defineStage } from 'eb/stage';",
      "import { project } from './space-wrecked/orbit';",
      'const r = Math.hypot(3, 4) ** 2 + Math.sin(1);',
      'export default defineStage({ frame() {} });',
    ].join('\n');
    const checked = checkStage(source, 'battle', files);
    expect(checked.problems).toEqual([]);
    expect(checked.imports).toEqual(['space-wrecked/orbit']);
    expect(checked.js).toContain('Math.hypot');
  });

  it('refuse Math.random, Date, the DOM, self and postMessage, each at its line', () => {
    const source = [
      'const a = Math.random();',
      'const b = Date.now();',
      "const c = document.createElement('canvas');",
      'self.postMessage(1);',
      'postMessage(2);',
    ].join('\n');
    const lines = checkStage(source, 'battle', files).problems.map((p) => [p.code, p.line]);
    expect(lines).toEqual([
      ['E029', 1],
      ['E029', 2],
      ['E029', 3],
      ['E029', 4],
      ['E029', 5],
    ]);
  });

  it("say E030 for an import that isn't eb/stage or a stage file, and E028 when it doesn't parse", () => {
    const checked = checkStage("import { x } from 'eb';\nimport { y } from './missing';", 'battle', files);
    expect(checked.problems.map((p) => [p.code, p.line])).toEqual([
      ['E030', 1],
      ['E030', 2],
    ]);
    expect(checkStage('const = 1;', 'battle', files).problems[0]).toMatchObject({ code: 'E028', line: 1 });
  });
});

describe('a stage loaded', () => {
  const API = { defineStage: (s: unknown) => s };

  it('runs its entry and the files it imports, with eb/stage the API given', () => {
    const compiled = new Map([
      [
        'battle',
        js(
          "import { defineStage } from 'eb/stage';\nimport { two } from './parts/two';\nexport default defineStage({ two });",
        ),
      ],
      ['parts/two', js("import { one } from '../one';\nexport const two = one + 1;")],
      ['one', js('export const one = 1;')],
    ]);
    expect(loadStage(compiled, 'battle', API).default).toEqual({ two: 2 });
  });

  it('says which file threw, and at which line', () => {
    const compiled = new Map([
      ['battle', js("import { boom } from './boom';\nexport default boom;")],
      ['boom', js("export const boom = 1;\n\nthrow new Error('the hull is breached');")],
    ]);
    try {
      loadStage(compiled, 'battle', API);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(StageError);
      expect(error).toMatchObject({ message: 'the hull is breached', file: 'stages/boom.ts', line: 3 });
    }
  });

  it('finds the file and line of an error thrown later, as a frame draws', () => {
    const compiled = new Map([['battle', js('export const frame = () => {\n  return (null as any).x;\n};')]]);
    const exports = loadStage(compiled, 'battle', API);
    try {
      (exports.frame as () => unknown)();
      throw new Error('should have thrown');
    } catch (error) {
      expect(asStageError(error)).toMatchObject({ file: 'stages/battle.ts', line: 2 });
    }
  });

  it('refuses an import that leaves stages/, and a file it has not got', () => {
    expect(() => loadStage(new Map([['battle', js("import 'fs';")]]), 'battle', API)).toThrow(/not "fs"/);
    expect(() => loadStage(new Map([['battle', js("import './gone';")]]), 'battle', API)).toThrow(
      'There is no stage file stages/gone.ts',
    );
  });
});
