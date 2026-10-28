/**
 * A screen's images in play (M7.4, D86, docs/specs/stages.md#screens-images): the pack's data URLs
 * go to the page with the game opened, PNG and SVG alike, which the shell gives its screens to show;
 * a pack without any sends none.
 */
import { createPack } from '@eb/core';
import { describe, expect, it } from 'vitest';
import type { Opened } from './fromPack.ts';
import { openedReply } from './host.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = 'data:image/svg+xml;base64,PHN2Zy8+';
const project = { id: 'deck', name: 'Deck', version: '0.1.0' };
const hud = { main: { widget: 'image', asset: 'alarm.svg', alt: 'The alarm' } };
const opened = (images?: Record<string, string>) =>
  ({
    pack: createPack(project, {}, undefined, { screens: { hud }, ...(images ? { images } : {}) }),
    screens: { hud },
    theme: undefined,
    shell: undefined,
    name: 'Deck',
    audio: { sounds: {}, ambiences: {}, musics: {}, files: {} },
  }) as unknown as Opened;

describe("a screen's images", () => {
  it('go to the page with the game opened, by asset path', () => {
    const reply = openedReply(1, opened({ 'alarm.svg': SVG, 'ship.png': PNG }));
    expect(reply.images).toEqual({ 'alarm.svg': SVG, 'ship.png': PNG });
  });

  it('are none for a pack without any', () => {
    expect(openedReply(1, opened()).images).toBeUndefined();
  });
});
