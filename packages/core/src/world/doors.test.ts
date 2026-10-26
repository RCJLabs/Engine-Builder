/**
 * The doors between spaces (M6.6, docs/specs/markers.md#places-and-doors): read from the uses and
 * zones whose effects enter another space, and the way toward a space over the fewest of them.
 */
import { describe, expect, it } from 'vitest';
import { doorsBetween, doorsOf, doorToward } from './doors.ts';

const enter = (space: string) => ({ effect: 'enter-space', space });
// A glen with a bothy behind a door, a shed through a zone, and a loft only the bothy reaches; the
// bothy also has a back door to the shed, so the shed is one door from both.
const WORLD = {
  uses: {
    glen: {
      'bothy/door': { label: 'Open', effects: [{ effect: 'set-flag', flag: 'x', to: true }, enter('bothy')] },
      rope: { label: 'Take', effects: [{ effect: 'give-item', item: 'rope' }] },
    },
    bothy: { door: { label: 'Open', effects: [enter('glen')] }, ladder: { label: 'Climb', effects: [enter('loft')] } },
    loft: { ladder: { label: 'Down', effects: [enter('bothy')] } },
  },
  triggers: {
    glen: { 'shed-way': { effects: [enter('shed')] } },
    bothy: { 'back-door': { effects: [enter('shed')] }, here: { effects: [enter('bothy')] } },
    shed: {},
  },
};

describe('the doors', () => {
  it('are the uses and zones that enter another space, by space and path', () => {
    expect(doorsOf(WORLD)).toEqual({
      glen: { 'bothy/door': 'bothy', 'shed-way': 'shed' },
      bothy: { door: 'glen', ladder: 'loft', 'back-door': 'shed' },
      loft: { ladder: 'bothy' },
    });
  });

  it('lead toward a space over the fewest of them', () => {
    const doors = doorsOf(WORLD);
    expect(doorToward(doors, 'glen', 'bothy')).toBe('bothy/door');
    expect(doorToward(doors, 'glen', 'shed')).toBe('shed-way');
    // Two doors away: the first door on the way.
    expect(doorToward(doors, 'glen', 'loft')).toBe('bothy/door');
    expect(doorToward(doors, 'loft', 'shed')).toBe('ladder');
    expect(doorToward(doors, 'bothy', 'shed')).toBe('back-door');
  });

  it('lead nowhere from a space to itself, or to one no door reaches', () => {
    const doors = doorsOf(WORLD);
    expect(doorToward(doors, 'glen', 'glen')).toBeUndefined();
    expect(doorToward(doors, 'shed', 'glen')).toBeUndefined();
    expect(doorToward(doors, 'glen', 'moor')).toBeUndefined();
  });

  it('go to the first by path when two are as near', () => {
    const doors = { a: { 'z-door': 'c', 'b-door': 'b' }, b: { x: 'd' }, c: { y: 'd' } };
    expect(doorToward(doors, 'a', 'd')).toBe('b-door');
  });

  it('count the fewest of them between two spaces (M6.7): none to itself, unknown where none leads', () => {
    const doors = doorsOf(WORLD);
    expect(doorsBetween(doors, 'glen', 'glen')).toBe(0);
    expect(doorsBetween(doors, 'glen', 'bothy')).toBe(1);
    expect(doorsBetween(doors, 'glen', 'shed')).toBe(1);
    expect(doorsBetween(doors, 'glen', 'loft')).toBe(2);
    expect(doorsBetween(doors, 'loft', 'shed')).toBe(2);
    expect(doorsBetween(doors, 'shed', 'glen')).toBeUndefined();
    expect(doorsBetween(doors, 'glen', 'moor')).toBeUndefined();
  });
});
