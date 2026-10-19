import { KITS } from '@eb/kits';
import { checkUi, knownFrom } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { feedbackTemplate, screenTemplate, themeTemplate } from './templates.ts';

const kits = KITS.map((kit) => kit.id);
const known = knownFrom({ kits });
const options = { facts: known.facts, openFacts: false, kits, events: known.events };

describe('templates', () => {
  it('writes a screen that checks clean, with a button that closes it (W134)', () => {
    const screens = new Map([['map', { file: 'ui/map.json', value: JSON.parse(screenTemplate('Map')) }]]);
    expect(checkUi(screens, undefined, options)).toEqual([]);
  });

  it('writes the engine’s theme, which checks clean', () => {
    expect(checkUi(new Map(), { file: 'ui/theme.json', value: JSON.parse(themeTemplate()) }, options)).toEqual([]);
  });

  it('writes feedback for the kits that are on, each line on an event they declare and saying its arguments', () => {
    const feedback = { file: 'ui/feedback.json', value: JSON.parse(feedbackTemplate(kits)) };
    expect(checkUi(new Map(), undefined, options, feedback)).toEqual([]);
    const lines = (on: readonly string[]) =>
      (JSON.parse(feedbackTemplate(on)) as { lines: { on: string }[] }).lines.map((line) => line.on.split('/')[0]);
    expect(new Set(lines(['inventory', 'quests']))).toEqual(new Set(['inventory', 'quests']));
    expect(lines([])).toEqual([]);
  });
});
