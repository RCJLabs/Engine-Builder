import { describe, expect, it } from 'vitest';
import { newManifest } from '../projects/manifest.ts';
import { checkJob, playJob } from './jobs.ts';
import type { SentFile } from './protocol.ts';
import { moduleName, moduleTemplate, stageTemplate, startFiles } from './templates.ts';

const encode = (text: string) => new TextEncoder().encode(text);
const project = (scripts: readonly (readonly [string, string])[]): SentFile[] => [
  ['project.json', newManifest('Start').bytes],
  ...scripts.map(([path, text]) => [path, encode(text)] as const),
];

describe('the scripts a game starts from', () => {
  it('load, check clean, and play to the end with no refused offer', async () => {
    const files = project(startFiles([]));
    const checked = await checkJob(
      files.filter(([path]) => path.startsWith('scripts/')),
      true,
    );
    expect(checked.diagnostics).toEqual([]);
    expect(checked.game).toMatchObject({ modules: ['logic', 'flag', 'sheet', 'main'], start: 'play' });
    expect(checked.game?.events['main/day-ended']).toMatchObject({ label: 'A day ends' });
    expect(checked.game?.policies).toEqual(['worker']);
    const played = await playJob(files, 20, 'worker');
    expect(played.kind === 'played' && played.ok).toBe(true);
    expect(played.kind === 'played' && played.lines[1]).toMatch(/^Ends: 20 ended/);
  });

  it('name the first module after any script there already, and add others that check clean', async () => {
    const [game, first] = startFiles(['main']);
    expect(first?.[0]).toBe('scripts/main-2.ts');
    expect(game?.[1]).toContain("import { main2 } from './main-2';");
    const checked = await checkJob(
      project([game, first, ['scripts/main.ts', moduleTemplate('main')], ['scripts/new.ts', moduleTemplate('new')]] as [
        string,
        string,
      ][]).filter(([path]) => path.startsWith('scripts/')),
      true,
    );
    // Unlisted by game.ts, the others are only warned about (W112).
    expect(checked.diagnostics.map((d) => `${d.code} ${d.file}`)).toEqual([
      'W112 scripts/main.ts',
      'W112 scripts/new.ts',
    ]);
    expect(checked.game?.modules).toEqual(['logic', 'flag', 'sheet', 'main-2']);
  });

  it('give each module a name code can use', () => {
    expect(moduleName('crew-quarters')).toBe('crewQuarters');
    expect(moduleName('2d-grid')).toBe('m2dGrid');
    expect(moduleName('new')).toBe('newModule');
    expect(moduleName('main')).toBe('main');
  });
});

describe('a new stage (M7.4)', () => {
  it('checks clean by the stage rules and draws a frame with a box for each use', async () => {
    const { checkStage } = await import('@eb/script');
    const { createStageRunner } = await import('../stagecode/runner.ts');
    const checked = checkStage(stageTemplate('battle'), 'battle', new Set(['battle']));
    expect(checked.problems).toEqual([]);
    const sent: unknown[] = [];
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_t, name: string) =>
          (...args: unknown[]) =>
            calls.push(`${name}(${args})`),
      },
    );
    const runner = createStageRunner(
      (m) => sent.push(m),
      () => 0,
    );
    const start = {
      space: 'deck',
      size: [100, 50],
      world: { space: {}, prefabs: {}, records: {}, uses: { alarm: { label: 'Sound the alarm' } } },
      places: { alarm: [50, 25], wall: [10, 10] },
      sheets: {},
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx };
    runner.take({
      kind: 'start',
      canvas: canvas as never,
      files: { battle: checked.js as string },
      entry: 'battle',
      start: start as never,
    });
    const frame = {
      t: 0,
      dt: 0,
      w: 200,
      h: 100,
      dpr: 1,
      still: false,
      walkers: [{ actor: 'ines', at: [10, 10], facing: 1, moving: false }],
      taken: [],
      input: [{ kind: 'drag', dx: 4, dy: 0 }],
    };
    runner.take({ kind: 'frame', frame: frame as never });
    expect(sent).toEqual([
      { kind: 'started' },
      { kind: 'drew', ms: 0, uses: [{ object: 'alarm', box: [92, 26, 24, 24] }] },
    ]);
    // The objects as boxes (no tilemap), the walker as a dot, the use outlined.
    expect(calls.filter((c) => c.startsWith('fillRect')).length).toBe(3);
    expect(calls).toContain('arc(24,76,4,0,6.283185307179586)');
    expect(calls).toContain('strokeRect(92,26,24,24)');
  });
});
