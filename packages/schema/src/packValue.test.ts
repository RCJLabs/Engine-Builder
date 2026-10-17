import { describe, expect, it } from 'vitest';
import { event, facts } from '../test/events.ts';
import { packValue } from './index.ts';

describe('packValue', () => {
  it('puts the tree in place of each condition written as text, wherever it is', () => {
    const value = {
      when: 'not voyage.night',
      choices: {
        'a/b': { when: 'hold.count(medkit) >= 2', effects: [] },
        tree: { when: { fact: 'voyage.night' }, effects: [] },
      },
    };
    const before = JSON.stringify(value);
    expect(packValue(event.schema, value, facts)).toEqual({
      when: { not: { fact: 'voyage.night' } },
      choices: {
        'a/b': { when: { fact: 'hold.count', args: { item: 'medkit' }, op: '>=', value: 2 }, effects: [] },
        tree: { when: { fact: 'voyage.night' }, effects: [] },
      },
    });
    // The value read from the file is left as it was.
    expect(JSON.stringify(value)).toBe(before);
  });

  it('gives back the same value when nothing is text', () => {
    const value = { choices: { go: { when: { fact: 'voyage.night' }, effects: [] } } };
    expect(packValue(event.schema, value, facts)).toBe(value);
  });

  it('throws on text that does not parse, which validation lets no pack hold', () => {
    expect(() => packValue(event.schema, { when: 'voyage.night and', choices: {} }, facts)).toThrow(
      'packValue: the condition at /when does not parse',
    );
  });
});
