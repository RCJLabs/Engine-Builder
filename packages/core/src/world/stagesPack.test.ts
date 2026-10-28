/**
 * Format 20 (M7.4, D86, docs/specs/stages.md#the-pack): a space's stage drawn in code, its files
 * compiled, or a screen's image as a data URL, whichever a game has; every pack without either keeps
 * its format and its hash.
 */
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../canonical.ts';
import { createPack, type PackUi, readPack } from '../pack.ts';
import type { PackWorld } from './packWorld.ts';

const project = { id: 'deck', name: 'Deck', version: '0.1.0' };
const reloaded = (value: unknown): Record<string, unknown> => JSON.parse(canonicalJson(value));
const world = (deck: Record<string, unknown>, more: Partial<PackWorld> = {}): PackWorld => ({
  spaces: { deck: { name: 'Deck', view: '2d', objects: [], ...deck } },
  prefabs: {},
  triggers: {},
  files: {},
  records: {},
  fields: {},
  uses: {},
  spawns: { deck: [] },
  start: 'deck',
  ...more,
});
const STAGES = { battle: 'module.exports.default = {};', 'space-wrecked/orbit': 'exports.orbit = 1;' };
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = 'data:image/svg+xml;base64,PHN2Zy8+';
const screens = (images?: Record<string, string>): PackUi => ({
  screens: { hud: { widget: 'image', asset: 'alarm.svg', alt: 'Alarm' } },
  ...(images ? { images } : {}),
});
const pack = (given?: PackWorld, ui?: PackUi) => createPack(project, {}, undefined, ui, undefined, undefined, given);

describe('format 20', () => {
  it('is a pack whose space names a stage, its files read back as written', () => {
    const staged = pack(world({ stage: 'battle' }, { stages: STAGES }));
    expect(staged.format).toBe(20);
    expect(staged.world?.stages).toEqual(STAGES);
    expect(readPack(reloaded(staged))).toEqual(reloaded(staged));
  });

  it('is a pack whose screens show an image, with spaces or none', () => {
    const shown = pack(undefined, screens({ 'alarm.svg': SVG, 'ship.png': PNG }));
    expect(shown.format).toBe(20);
    expect(shown.world).toBeUndefined();
    expect(shown.ui?.images).toEqual({ 'alarm.svg': SVG, 'ship.png': PNG });
    expect(readPack(reloaded(shown))).toEqual(reloaded(shown));
    expect(readPack(reloaded(pack(world({}), screens({ 'alarm.svg': SVG })))).format).toBe(20);
  });

  it('keeps the format of a pack with no stage named and no image', () => {
    expect(pack(world({})).format).toBe(17);
    // Stage files no space names are none: the compiler packs only what a stage reaches.
    expect(pack(world({}, { stages: STAGES })).format).toBe(17);
    expect(pack(world({}, { stages: STAGES })).world?.stages).toBeUndefined();
    expect(pack(undefined, screens()).format).toBe(4);
    expect(pack(undefined, screens({})).ui?.images).toBeUndefined();
  });

  it('refuses a stage or an image in a pack before format 20', () => {
    const staged = reloaded(pack(world({ stage: 'battle' }, { stages: STAGES })));
    expect(() => readPack({ ...staged, format: 19 })).toThrow('Unknown pack world fields: stages');
    const shown = reloaded(pack(undefined, screens({ 'alarm.svg': SVG })));
    expect(() => readPack({ ...shown, format: 19 })).toThrow('Unknown pack ui fields: images');
  });

  it.each([
    [
      'neither',
      (p: Record<string, unknown>) => ({ ...p, world: undefined }),
      'A format 20 pack has no stage and no image',
    ],
    [
      'a stage the pack lacks',
      (p: Record<string, unknown>) => ({ ...p, world: { ...(p.world as object), stages: { other: '' } } }),
      'The space "deck" names a stage the pack lacks',
    ],
    [
      "a stage file that isn't text",
      (p: Record<string, unknown>) => ({ ...p, world: { ...(p.world as object), stages: { battle: 1 } } }),
      "The pack's stages are not JavaScript by path",
    ],
    [
      'a stage file that is no path',
      (p: Record<string, unknown>) => ({ ...p, world: { ...(p.world as object), stages: { battle: '', '../x': '' } } }),
      '"../x" is not a stage file\'s path',
    ],
  ])('refuses %s', (_name, change, message) => {
    expect(() => readPack(change(reloaded(pack(world({ stage: 'battle' }, { stages: STAGES })))))).toThrow(message);
  });

  it('refuses an image that is not an image as a data URL', () => {
    const shown = reloaded(pack(undefined, screens({ 'alarm.svg': SVG })));
    const ui = shown.ui as Record<string, unknown>;
    for (const url of ['https://example.com/a.png', 'data:text/html;base64,PGI+', 'data:image/png,<svg>'])
      expect(() => readPack({ ...shown, ui: { ...ui, images: { 'alarm.svg': url } } })).toThrow(
        `The pack's image "alarm.svg" is not an image's data URL`,
      );
  });
});
