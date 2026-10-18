import { describe, expect, it } from 'vitest';
import { newManifest } from '../projects/manifest.ts';
import { checkJob, playJob } from './jobs.ts';
import type { SentFile } from './protocol.ts';
import { moduleName, moduleTemplate, startFiles } from './templates.ts';

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
