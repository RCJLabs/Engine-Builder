/**
 * A project's stages (M7.4, D86, docs/specs/stages.md#checks): a 2D space whose stage is a file
 * under stages/ is clean and packs the files its stage reaches as format 20; each check broken once
 * (E095, E058, E029, E030, W159); and a screen's image packed as a data URL, PNG and SVG.
 */
import { readPack } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { pngOf } from '../test/png.ts';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';

// Written out a field a line, as the editor writes them, so a problem's line says which field.
const json = (value: unknown) => JSON.stringify(value, null, 2);

const DECK = { name: 'Deck', view: '2d', fit: [176, 80], size: [176, 80], stage: 'battle', objects: [] };
const BATTLE = [
  "import { defineStage } from 'eb/stage';",
  "import { board } from './space-wrecked/board';",
  'export default defineStage({ frame(g) { board(g); } });',
].join('\n');
const BOARD = "import { tilt } from '../tilt';\nexport const board = (g: unknown) => tilt(g, Math.sin(0.5) ** 2);";
const TILT = 'export const tilt = (g: unknown, by: number) => [g, by];';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>';

function project(files: Record<string, string | Uint8Array | object>) {
  return memorySource({
    'project.json': json({ format: 1, id: 'deck', name: 'Deck', version: '0.1.0' }),
    'spaces/deck.json': json(DECK),
    'stages/battle.ts': BATTLE,
    'stages/space-wrecked/board.ts': BOARD,
    'stages/tilt.ts': TILT,
    'stages/space-wrecked/NOTICE': 'All rights reserved',
    ...Object.fromEntries(
      Object.entries(files).map(([path, value]) => [
        path,
        typeof value === 'string' || value instanceof Uint8Array ? value : json(value),
      ]),
    ),
  });
}

const compile = async (files: Record<string, string | Uint8Array | object> = {}) => compileProject(project(files), []);
/** Each problem but the provenance log's, which these assets have none of. */
const problems = async (files: Record<string, string | Uint8Array | object> = {}) =>
  (await compile(files)).diagnostics
    .filter((d) => d.code !== 'E019')
    .map((d) => `${d.code} ${d.file} ${d.path}${d.line !== undefined ? `:${d.line}` : ''}`);

describe('stages', () => {
  it('pack the files a 2D space’s stage reaches as format 20, and nothing else under stages/', async () => {
    const { diagnostics, pack } = await compile();
    expect(diagnostics).toEqual([]);
    expect(pack?.format).toBe(20);
    expect(Object.keys(pack?.world?.stages ?? {})).toEqual(['battle', 'space-wrecked/board', 'tilt']);
    expect(pack?.world?.stages?.battle).toContain("require('./space-wrecked/board')");
    expect(readPack(JSON.parse(JSON.stringify(pack)))).toEqual(JSON.parse(JSON.stringify(pack)));
  });

  it('say E095 at a space whose stage names no file', async () => {
    expect(await problems({ 'spaces/deck.json': { ...DECK, stage: 'missing' } })).toEqual([
      'E095 spaces/deck.json /stage:12',
      'W159 stages/battle.ts ',
      'W159 stages/space-wrecked/board.ts ',
      'W159 stages/tilt.ts ',
    ]);
  });

  it('say E058 for a stage on a 3D space, which walk.js draws', async () => {
    const { view, fit, size, ...plain } = DECK;
    expect(await problems({ 'spaces/deck.json': plain })).toEqual(['E058 spaces/deck.json /stage:3']);
  });

  it('say W159 for a file no stage reaches, and leave it out', async () => {
    const { diagnostics, pack } = await compile({ 'stages/old.ts': 'export const old = 1;' });
    expect(diagnostics.map((d) => `${d.code} ${d.file}`)).toEqual(['W159 stages/old.ts']);
    expect(pack?.world?.stages?.old).toBeUndefined();
  });

  it('hold a stage file to the stage rules and its imports, at their lines', async () => {
    const broken = `${TILT}\nexport const page = document.title;\nimport { x } from '../scripts/game';`;
    expect(await problems({ 'stages/tilt.ts': broken })).toEqual(['E029 stages/tilt.ts :2', 'E030 stages/tilt.ts :3']);
    expect(await problems({ 'stages/Board.ts': TILT })).toEqual(['E030 stages/Board.ts ']);
  });
});

describe("screens' images", () => {
  const hud = {
    shows: ['play'],
    main: {
      widget: 'panel',
      children: [
        { widget: 'image', asset: 'icons/alarm.svg', alt: 'Alarm' },
        { widget: 'image', asset: 'ship.png', alt: 'The ship' },
      ],
    },
  };

  it('go into the pack as data URLs by their path, PNG and SVG', async () => {
    const png = pngOf(4, 4, 2, 2);
    const own = { licence: 'own', source: 'Drawn for the test', date: '2026-10-27' };
    const { pack, diagnostics } = await compile({
      'ui/hud.json': hud,
      'assets/icons/alarm.svg': SVG,
      'assets/ship.png': png,
      'assets/assets.json': { files: { 'icons/alarm.svg': own, 'ship.png': own } },
    });
    expect(diagnostics).toEqual([]);
    expect(pack?.format).toBe(20);
    expect(pack?.ui?.images).toEqual({
      'icons/alarm.svg': `data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}`,
      'ship.png': `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
    });
  });

  it('must be images: anything else is E047 at the widget', async () => {
    const odd = { ...hud, main: { widget: 'image', asset: 'notes.txt', alt: 'Notes' } };
    expect(await problems({ 'ui/hud.json': odd, 'assets/notes.txt': 'x' })).toEqual(['E047 ui/hud.json /main/asset:7']);
  });
});
