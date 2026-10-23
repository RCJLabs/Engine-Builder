import { describe, expect, it } from 'vitest';
import { holdsWords, replayWords, slotOf, timeSteps } from './words.ts';

describe('the debug tools’ words', () => {
  it('gives one +1 button for each length the calendar has, named by its unit', () => {
    expect(timeSteps({ ticksPerDay: 1 })).toEqual([{ unit: 'days', label: '+1 day' }]);
    expect(timeSteps({ ticksPerDay: 4, units: { weeks: 28, hours: 1 } })).toEqual([
      { unit: 'hours', label: '+1 hour' },
      { unit: 'days', label: '+1 day' },
      { unit: 'weeks', label: '+1 week' },
    ]);
    expect(timeSteps({ ticksPerDay: 2 }).map((step) => step.label)).toEqual(['+1 tick', '+1 day']);
  });

  it('says what Replay found', () => {
    expect(replayWords({ kind: 'same', steps: 4 })).toBe('All 4 steps play out the same.');
    expect(replayWords({ kind: 'same', steps: 1 })).toBe('The one step plays out the same.');
    expect(replayWords({ kind: 'same', steps: 0 })).toMatch(/no steps/);
    expect(replayWords({ kind: 'refused', at: 3, label: 'Rest', reason: 'mode' })).toBe(
      'Step 3 (Rest) is refused now: mode. The game stands before it.',
    );
    const place = { slice: 'economy', path: '/amounts/coins', was: 30, now: 40, also: ['factions', 'quests'] };
    expect(replayWords({ kind: 'differs', at: 2, label: 'Carry', place })).toBe(
      'Step 2 (Carry) plays out differently: in economy, /amounts/coins was 30, now 40; factions and quests changed too.',
    );
    const start = { slice: 'camp', path: '', was: undefined, now: { a: 1 }, also: [] };
    expect(replayWords({ kind: 'differs', at: 0, label: 'The start', place: start })).toBe(
      'The start differs: the camp slice was nothing, now {"a":1}.',
    );
  });

  it('words a condition’s truth, and makes a slot of a name', () => {
    expect([true, false, null, undefined].map(holdsWords)).toEqual(['holds', 'doesn’t hold', 'can’t tell', '']);
    expect(slotOf('Day 3, before the storm!')).toBe('day-3-before-the-storm');
    expect(slotOf('  Égal  ')).toBe('egal');
    expect(slotOf('—')).toBeUndefined();
    expect(slotOf('x'.repeat(70))).toHaveLength(64);
  });
});
