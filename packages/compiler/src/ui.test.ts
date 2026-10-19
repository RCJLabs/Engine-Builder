import { readPack } from '@eb/core';
import { ENGINE_FACTS } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { type CompileOptions, compileProject, memorySource } from './index.ts';
import { classifyUi } from './uiFiles.ts';

const project = (kits: string[] = []) =>
  JSON.stringify({ format: 1, id: 'hut', name: 'Hut', version: '0.1.0', ...(kits.length > 0 ? { kits } : {}) });
// The engine's own theme, as a game's ui/theme.json would copy it.
const DEFAULT_THEME = {
  colors: {
    background: '#14161a',
    surface: '#1f232a',
    text: '#eef0f3',
    muted: '#a9b0bb',
    accent: '#7cc4ff',
    'on-accent': '#0b1220',
  },
};
const hud = { shows: ['hut'], main: { widget: 'text', text: 'Day {time.day}' } };
const compile = (files: Record<string, string>, options: CompileOptions = {}, kits = ['time']) =>
  compileProject(memorySource({ 'project.json': project(kits), ...files }), [], options);
const brief = (result: Awaited<ReturnType<typeof compile>>) =>
  result.diagnostics.map(({ code, file, path, message }) => ({ code, file, path, message }));

describe('classifyUi', () => {
  it('reads ui/theme.json as the theme, ui/feedback.json as the feedback and ui/<id>.json as a screen', () => {
    expect(classifyUi('ui/theme.json')).toEqual({ kind: 'theme' });
    expect(classifyUi('ui/feedback.json')).toEqual({ kind: 'feedback' });
    expect(classifyUi('ui/hud.json')).toEqual({ kind: 'screen', id: 'hud' });
    expect(classifyUi('ui/store-front.json')).toEqual({ kind: 'screen', id: 'store-front' });
  });

  it('ignores anything else, saying why', () => {
    expect(classifyUi('ui/notes.md')).toEqual({ kind: 'ignored', reason: 'Ignored: screens are ui/<id>.json' });
    expect(classifyUi('ui/old/hud.json')).toMatchObject({ kind: 'ignored', reason: expect.stringContaining('folder') });
    expect(classifyUi('ui/Hud.json')).toMatchObject({ kind: 'ignored', reason: expect.stringContaining('"Hud"') });
  });
});

describe('compiling ui/', () => {
  it('packs the screens, sorted, and the theme as format 4', async () => {
    const result = await compile({
      'ui/store.json': JSON.stringify({
        main: { widget: 'text', text: 'Store' },
        bottom: { widget: 'button', label: 'Close', action: { close: true } },
        modal: true,
      }),
      'ui/hud.json': JSON.stringify(hud),
      'ui/theme.json': JSON.stringify(DEFAULT_THEME),
    });
    expect(brief(result)).toEqual([]);
    const pack = readPack(JSON.parse(JSON.stringify(result.pack)));
    expect(pack.format).toBe(4);
    expect(Object.keys(pack.ui?.screens ?? {})).toEqual(['hud', 'store']);
    expect(pack.ui?.screens.hud).toEqual(hud);
    expect(pack.ui?.theme).toEqual(DEFAULT_THEME);
    expect(pack.project.kits).toEqual(['time']);
  });

  it('packs the feedback as format 5, with the screens or without, and checks it against the game (M4.2)', async () => {
    const feedback = { lines: [{ on: 'time/passed', say: 'Time passes', to: 'log' }] };
    const events = { 'time/passed': { args: { from: { type: 'int' as const }, to: { type: 'int' as const } } } };
    const result = await compile(
      { 'ui/hud.json': JSON.stringify(hud), 'ui/feedback.json': JSON.stringify(feedback) },
      {
        events,
      },
    );
    expect(brief(result)).toEqual([]);
    const pack = readPack(JSON.parse(JSON.stringify(result.pack)));
    expect(pack.format).toBe(5);
    expect(pack.ui).toEqual({ screens: { hud }, feedback });
    const alone = await compile({ 'ui/feedback.json': JSON.stringify(feedback) }, { events });
    expect(alone.pack?.format).toBe(5);
    expect(alone.pack?.ui).toEqual({ screens: {}, feedback });
    // Lines that say nothing leave the pack as it was.
    const silent = await compile({ 'ui/hud.json': JSON.stringify(hud), 'ui/feedback.json': '{ "lines": [] }' });
    expect(silent.pack?.format).toBe(4);
    const wrong = await compile(
      { 'ui/feedback.json': JSON.stringify({ lines: [{ on: 'time/ran', say: 'x' }] }) },
      {
        events,
      },
    );
    expect(brief(wrong)).toEqual([
      { code: 'E051', file: 'ui/feedback.json', path: '/lines/0/on', message: 'The game declares no event "time/ran"' },
    ]);
    expect(wrong.diagnostics[0]).toMatchObject({ line: 1 });
    expect(wrong.pack).toBeNull();
  });

  it('leaves a project without screens in the format it had, a theme alone included', async () => {
    const plain = await compile({});
    const themed = await compile({ 'ui/theme.json': JSON.stringify(DEFAULT_THEME) });
    expect(plain.pack?.format).toBe(3);
    expect(themed.pack).toEqual(plain.pack);
  });

  it('warns of files it ignores and gives a screen that isn’t JSON one E007', async () => {
    const result = await compile({
      'ui/notes.md': '',
      'ui/map.json': '{ "main": ',
      'ui/hud.json': JSON.stringify({ ...hud, top: { widget: 'button', label: 'Map', action: { open: 'map' } } }),
    });
    expect(brief(result)).toEqual([
      expect.objectContaining({ code: 'E007', file: 'ui/map.json', path: '' }),
      { code: 'W132', file: 'ui/notes.md', path: '', message: 'Ignored: screens are ui/<id>.json' },
    ]);
    expect(result.pack).toBeNull();
  });

  it('checks the screens against the game: its facts, its actions and its modes', async () => {
    const screen = {
      shows: ['hut', 'sea'],
      main: {
        widget: 'stack',
        children: [
          { widget: 'text', text: '{hold.count}' },
          { widget: 'button', label: 'Sail', action: { take: 'hold/sail' } },
          { widget: 'list', of: 'shelf', item: { widget: 'text', text: '{.name}' } },
        ],
      },
    };
    const facts = { ...ENGINE_FACTS };
    const options: CompileOptions = { facts, actions: ['hut/rest'], modes: ['hut', 'closed'] };
    const result = await compile({ 'ui/hud.json': JSON.stringify(screen) }, options);
    expect(brief(result).map(({ code, path }) => `${code} ${path}`)).toEqual([
      'W133 ',
      'E048 /main/children/0/text',
      'E049 /main/children/1/action/take',
      'E049 /main/children/2/of',
      'E049 /shows/1',
    ]);
  });

  it('checks a fact’s arguments against the records, scenes’ talks among them', async () => {
    const files = {
      'records/resource/coins.json': '{}',
      'ui/hud.json': JSON.stringify({
        shows: ['hut'],
        main: {
          widget: 'stack',
          children: [
            { widget: 'text', text: '{economy.amount(resource: coins)}' },
            { widget: 'text', text: '{economy.amount(resource: gold)}' },
          ],
        },
      }),
    };
    const result = await compile(files, {}, ['inventory', 'economy']);
    expect(brief(result)).toEqual([
      expect.objectContaining({ code: 'E048', file: 'ui/hud.json', path: '/main/children/1/text' }),
    ]);
    expect(result.diagnostics[0]?.message).toContain('gold');
  });

  it('takes images from assets/', async () => {
    const files = {
      'assets/hut.png': 'png',
      'assets/provenance.json': JSON.stringify({
        assets: { 'hut.png': { source: 'made', licence: 'CC0-1.0', author: 'Evan' } },
      }),
      'ui/hud.json': JSON.stringify({
        shows: ['hut'],
        main: {
          widget: 'stack',
          children: [
            { widget: 'image', asset: 'hut.png', alt: 'The hut' },
            { widget: 'image', asset: 'map.png', alt: 'A map' },
          ],
        },
      }),
    };
    const result = await compile(files);
    expect(brief(result).filter((d) => d.file === 'ui/hud.json')).toEqual([
      { code: 'E018', file: 'ui/hud.json', path: '/main/children/1/asset', message: 'No asset "map.png" in assets/' },
    ]);
  });
});
