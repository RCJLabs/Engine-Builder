import { describe, expect, it } from 'vitest';
import { LOG_KEPT, type Said } from '../format/feedback.ts';
import { logAfter, spokenOf, toastsOf, toastTime } from './feedback.ts';

const said: Said[] = [
  { text: 'Rope ×1 into the bag', to: 'both' },
  { text: 'Coins: -30', to: 'log' },
  { text: 'Greta has news', to: 'toast' },
];

describe('a play’s feedback on the page', () => {
  it('logs what is said to the log or both, numbered from the start, newest last', () => {
    const log = logAfter([], said);
    expect(log).toEqual([
      { n: 1, text: 'Rope ×1 into the bag' },
      { n: 2, text: 'Coins: -30' },
    ]);
    expect(logAfter(log, [{ text: 'Day 2', to: 'log' }]).at(-1)).toEqual({ n: 3, text: 'Day 2' });
    // A step that logs nothing leaves the log as it was, the same object, so nothing redraws.
    expect(logAfter(log, [{ text: 'Hi', to: 'toast' }])).toBe(log);
  });

  it('keeps the last 100 lines', () => {
    let log = logAfter([], []);
    for (let i = 0; i < 130; i++) log = logAfter(log, [{ text: `Line ${i + 1}`, to: 'log' }]);
    expect(log.length).toBe(LOG_KEPT);
    expect(log[0]).toEqual({ n: 31, text: 'Line 31' });
    expect(log.at(-1)).toEqual({ n: 130, text: 'Line 130' });
  });

  it('toasts what is said to the toast or both, and speaks every line once', () => {
    expect(toastsOf(said)).toEqual(['Rope ×1 into the bag', 'Greta has news']);
    expect(spokenOf(said)).toBe('Rope ×1 into the bag Coins: -30 Greta has news');
  });

  it('keeps a toast up by its length, at least 2.6 s, and cuts it to 1.4 s while others wait', () => {
    expect(toastTime('Hi', false)).toBe(2600);
    expect(toastTime('x'.repeat(100), false)).toBe(4500);
    expect(toastTime('x'.repeat(100), true)).toBe(1400);
    expect(toastTime('Hi', true)).toBe(1400);
  });
});
