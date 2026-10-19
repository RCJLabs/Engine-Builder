/**
 * The quest map's layout (M3.9): rows by steps from the first stage, the stages it doesn't reach
 * last, where each stage leads and how it can fail, and a value caught half made, which never
 * throws.
 */
import { describe, expect, it } from 'vitest';
import { questMap } from './questMap.ts';

const DEBT = {
  name: 'The miner’s debt',
  stages: [
    {
      id: 'owed',
      log: 'A miner wants 30 credits back within six days.',
      objectives: [
        { id: 'pay', text: 'Pay the miner', 'done-when': 'flag.on(paid)', next: 'square' },
        { id: 'refuse', text: 'Or tell him no', 'done-when': 'flag.on(refused)', next: 'hunted' },
      ],
      days: 6,
    },
    { id: 'square', log: 'The miner shook your hand.' },
    { id: 'hunted', log: 'His friends found you.', fails: true },
  ],
};

const ids = (rows: ReturnType<typeof questMap>) => rows.map((row) => [row.steps, row.boxes.map((b) => b.id)]);

describe('the quest map', () => {
  it('puts the stages in rows by steps from the first, each saying where it leads and how it fails', () => {
    const rows = questMap('debt', DEBT);
    expect(ids(rows)).toEqual([
      [0, ['owed']],
      [1, ['square', 'hunted']],
    ]);
    const [owed, square, hunted] = rows.flatMap((row) => row.boxes);
    expect(owed).toEqual({
      index: 0,
      id: 'owed',
      log: 'A miner wants 30 credits back within six days.',
      exits: [
        { by: '“Pay the miner”', to: 'square', found: true },
        { by: '“Or tell him no”', to: 'hunted', found: true },
      ],
      fails: ['Fails after 6 days'],
      stuck: false,
    });
    expect(square?.exits).toEqual([{ by: 'Then', to: undefined, found: true }]);
    expect([hunted?.exits, hunted?.fails]).toEqual([[], ['Fails as it is reached']]);
  });

  it('shows a Then that is never taken, a lead to no stage, its own set-stages, and stages it can’t end from', () => {
    const rows = questMap('loop', {
      stages: [
        {
          id: 'round',
          objectives: [{ id: 'go', text: 'Go', 'done-when': 'flag.on(a)', next: 'again' }],
          next: 'lost',
          'fail-when': '',
        },
        {
          id: 'again',
          objectives: [{ id: 'back', text: 'Back', 'done-when': 'flag.on(b)', next: 'round' }],
          effects: [
            { effect: 'set-stage', quest: 'loop', stage: 'round' },
            { effect: 'set-stage', quest: 'other', stage: 'x' },
          ],
        },
        { id: 'lost' },
      ],
    });
    expect(ids(rows)).toEqual([
      [0, ['round']],
      [1, ['again']],
      [undefined, ['lost']],
    ]);
    const [round, again, lost] = rows.flatMap((row) => row.boxes);
    expect(round?.exits).toEqual([
      { by: '“Go”', to: 'again', found: true },
      { by: 'Then', to: 'lost', found: true, never: true },
    ]);
    expect(again?.exits).toEqual([
      { by: '“Back”', to: 'round', found: true },
      { by: 'Its effects', to: 'round', found: true },
    ]);
    expect([round?.stuck, again?.stuck, lost?.stuck]).toEqual([true, true, false]);
    expect(questMap('q', { stages: [{ id: 'a', next: 'b' }] })[0]?.boxes[0]?.exits).toEqual([
      { by: 'Then', to: 'b', found: false },
    ]);
  });

  it('orders the rows by steps, reads the first stage of an id twice, and no deadline on a stage done at once', () => {
    const rows = questMap('q', {
      stages: [
        { id: 'a', next: 'c' },
        { id: 'b', objectives: [{ id: 'x', text: 'X', 'done-when': 'flag.on(f)' }] },
        { id: 'c', next: 'b', days: 3 },
        { id: 'a', next: 'd' },
        { id: 'd' },
      ],
    });
    expect(ids(rows)).toEqual([
      [0, ['a']],
      [1, ['c']],
      [2, ['b']],
      [undefined, ['a', 'd']],
    ]);
    expect(rows[1]?.boxes[0]?.fails).toEqual([]);
  });

  it('draws a quest caught half made, and nothing for one with no stages yet', () => {
    expect(questMap('q', undefined)).toEqual([]);
    expect(questMap('q', { stages: 'none' })).toEqual([]);
    const rows = questMap('q', {
      stages: [{ id: 'a', objectives: [{}, 'x', { next: 7 }], days: 'two' }, { log: 'No id yet' }, 3, { id: 'a' }],
    });
    expect(ids(rows)).toEqual([
      [0, ['a']],
      [undefined, ['a']],
    ]);
    expect(rows[0]?.boxes[0]?.fails).toEqual([]);
  });
});
