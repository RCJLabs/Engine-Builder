import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkPureSource, scan, stageViolations } from '@eb/purity';
import { describe, expect, it } from 'vitest';
import { sourceFiles, workspacePackages } from '../src/workspace.ts';

const PURE = new Set(['@eb/core']);
const rules = (source: string) => checkPureSource('x.ts', source, PURE).map((v) => `${v.line}:${v.rule}`);
const lines = (source: string) => checkPureSource('x.ts', source, PURE).map((v) => v.line);

describe('pure rules', () => {
  it('flags nondeterminism and host APIs, one per line', () => {
    const source = [
      'const a = Math.random();',
      'const b = Math.pow(2, 3);',
      'const c = 2 ** 3;',
      'const d = new Date();',
      "const e = 'a'.localeCompare('b');",
      'const f = globalThis.innerWidth;',
      'const g = performance.now();',
    ].join('\n');
    expect(lines(source)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('allows integer math and correctly rounded operations', () => {
    expect(
      rules('const x = Math.imul(3, 5) >>> 0;\nconst y = Math.sqrt(16) + Math.floor(2.5) + Math.abs(-1);'),
    ).toEqual([]);
  });

  it('allows property names that look like globals', () => {
    expect(rules('interface A { readonly require?: string[] }\nconst a = { require: [], performance: 1 };')).toEqual(
      [],
    );
    expect(rules('use(arch.require, o.window, o.document);')).toEqual([]);
    expect(lines("const fs = require('fs');")).toEqual([1]);
  });

  it('allows relative imports and pure workspace packages only', () => {
    expect(rules("import { a } from './a.ts';\nexport { b } from '../b.ts';\nimport { c } from '@eb/core';")).toEqual(
      [],
    );
    expect(rules("import { z } from 'zod';")).toEqual([
      '1:pure code may import only its own files and pure packages (found "zod")',
    ]);
    // A dynamic import breaks two rules: what it imports, and code chosen at run time.
    expect(lines("import 'side-effect';\nconst m = await import('node:fs');\nimport type { T } from 'three';")).toEqual(
      [1, 2, 2, 3],
    );
  });
});

describe('stage rules (M7.4)', () => {
  const stage = (source: string) => stageViolations('x.ts', scan(source).code).map((v) => v.line);

  it('let a picture use transcendental Math and **, but nothing nondeterministic or host-bound', () => {
    expect(stage('const a = Math.sin(1) + Math.atan2(1, 2) + 2 ** 3;')).toEqual([]);
    const source = ['const a = Math.random();', 'const b = Date.now();', 'document.body;', 'fetch(x);'].join('\n');
    expect(stage(source)).toEqual([1, 2, 3, 4]);
  });

  it('refuse self and postMessage, so a stage answers only through what frame returns', () => {
    expect(stage('self.close();\npostMessage(1);\nonmessage = f;\nimportScripts(x);')).toEqual([1, 2, 3, 4]);
    expect(stage('const o = { self: 1 };\nworker.postMessage(1);')).toEqual([]);
  });
});

describe('scan', () => {
  it('keeps line numbers and length when blanking', () => {
    const source = "a\n/* x\ny */\nconst s = 'q\\'r';\n`t\n${u}`";
    const { code } = scan(source);
    expect(code.split('\n')).toHaveLength(source.split('\n').length);
    expect(code).toHaveLength(source.length);
  });

  it('does not read // inside a string as a comment', () => {
    expect(lines("const u = 'http://x'; const r = Math.random();")).toEqual([1]);
  });

  it('checks code inside template expressions but not template text', () => {
    expect(lines('const t = `Math.random() ${Date.now()}`;')).toEqual([1]);
    expect(rules('const t = `Math.random() and Date in text`;')).toEqual([]);
    expect(rules('const t = `a ${`nested ${1 + 2}`} b`; const n = { x: 1 };')).toEqual([]);
  });

  it('tells regex literals from division', () => {
    expect(rules('const re = /Date|\\*\\*/g; const q = a / b / 2;')).toEqual([]);
    expect(rules('const f = (s) => /Math.random/.test(s);')).toEqual([]);
    expect(lines('const x = (a) / 2; const y = Date;')).toEqual([1]);
  });

  it('collects every import form with its line', () => {
    const { imports } = scan(
      "import a from 'a';\nimport { b } from \"b\";\nexport * from './c.ts';\nimport 'd';\nconst e = import('e');",
    );
    expect(imports).toEqual([
      { spec: 'a', line: 1 },
      { spec: 'b', line: 2 },
      { spec: './c.ts', line: 3 },
      { spec: 'd', line: 4 },
      { spec: 'e', line: 5 },
    ]);
  });
});

describe('fixtures', () => {
  const dir = resolve(import.meta.dirname, '../fixtures');
  const fixtures = (kind: 'bad' | 'good') =>
    readdirSync(join(dir, kind)).map((name) => ({ name, source: readFileSync(join(dir, kind, name), 'utf8') }));

  it('every bad fixture fails with exactly the rules it declares', () => {
    const bad = fixtures('bad');
    expect(bad.length).toBeGreaterThanOrEqual(7);
    for (const { name, source } of bad) {
      const expected = [...source.matchAll(/^\/\/ @expect (.+)$/gm)].map((m) => m[1]);
      expect(expected.length, `${name} declares no @expect`).toBeGreaterThan(0);
      const found = [...new Set(checkPureSource(name, source, PURE).map((v) => v.rule))];
      expect(found.sort(), name).toEqual([...new Set(expected)].sort());
    }
  });

  it('every good fixture passes', () => {
    for (const { name, source } of fixtures('good')) {
      expect(checkPureSource(name, source, PURE), name).toEqual([]);
    }
  });
});

describe('workspace discovery', () => {
  const root = resolve(import.meta.dirname, '../../..');

  it('finds the pure packages and skips tests', () => {
    const packages = workspacePackages(root);
    expect(packages.find((p) => p.name === '@eb/core')?.pure).toBe(true);
    expect(packages.find((p) => p.name === '@eb/editor')?.pure).toBe(false);
    const core = packages.find((p) => p.name === '@eb/core');
    const files = sourceFiles(core?.dir ?? '');
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
  });
});
