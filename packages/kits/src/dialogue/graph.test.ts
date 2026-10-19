/**
 * Where a talk's lines lead (docs/specs/dialogue.md#checks): what W121 and the editor's map read.
 */
import { describe, expect, it } from 'vitest';
import { RECORDS } from '../../test/crag.ts';
import { leadsFrom, stepsFrom } from './graph.ts';
import type { TalkRecord } from './types.ts';

const marge = RECORDS.talk.marge as TalkRecord;
const talk = (lines: object[], starts = [{ line: 'a' }]) => ({ starts, lines }) as unknown as TalkRecord;

describe('a line', () => {
  it('leads to its options’ lines and their outcomes’, in the order written, then to its own Then', () => {
    const again = marge.lines.find((line) => line.id === 'again');
    expect(again && leadsFrom(again)).toEqual(['thanks', 'beta-given', 'sent', 'fell', 'after-gear']);
    expect(leadsFrom({ id: 'tour', text: '', next: 'again' })).toEqual(['again']);
    expect(leadsFrom({ id: 'end', text: '' })).toEqual([]);
  });
});

describe('the steps to each line', () => {
  it('are the fewest from any start, by options, outcomes and Thens', () => {
    expect(Object.fromEntries(stepsFrom(marge))).toEqual({
      again: 0,
      hello: 0,
      thanks: 1,
      'beta-given': 1,
      sent: 1,
      fell: 1,
      'after-gear': 1,
      tour: 1,
    });
  });

  it('leave out a line no start reaches, a pair that leads only to each other, and a start naming no line', () => {
    const lines = [
      { id: 'a', text: '', next: 'b' },
      { id: 'b', text: '' },
      { id: 'tick', text: '', next: 'tock' },
      { id: 'tock', text: '', next: 'tick' },
    ];
    expect([...stepsFrom(talk(lines, [{ line: 'gone' }, { line: 'a' }]))]).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('visit each line once, however many options lead to it: a map and W121 read it on every edit', () => {
    // Each line's two options lead to the next: visited once per path, the 40th row would hold 2^39.
    const lines = Array.from({ length: 40 }, (_, i) => ({
      id: `l${i}`,
      text: '',
      options: [
        { id: `a${i}`, label: '', next: `l${i + 1}` },
        { id: `b${i}`, label: '', next: `l${i + 1}` },
      ],
    }));
    const t0 = performance.now();
    const steps = stepsFrom(talk(lines, [{ line: 'l0' }]));
    expect(performance.now() - t0).toBeLessThan(500);
    expect([steps.size, steps.get('l39')]).toEqual([40, 39]);
  });

  it('follow the first of two lines with one id, as the kit shows it', () => {
    const lines = [
      { id: 'a', text: '', next: 'b' },
      { id: 'b', text: '' },
      { id: 'a', text: '', next: 'c' },
      { id: 'c', text: '' },
    ];
    expect(stepsFrom(talk(lines)).has('c')).toBe(false);
  });
});
