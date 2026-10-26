import { describe, expect, it } from 'vitest';
import { addState, addTransition, canMove, canRemove, moveRow, removeRow, rowsOf } from './outline.ts';

const LAYER = {
  start: 'idle',
  states: [
    { id: 'idle', clip: 'idle', loop: true },
    { id: 'walk', clip: 'walk', loop: true, rate: 'pace' },
  ],
  transitions: [
    { from: 'idle', to: 'walk', when: 'anim.speed > 0.2' },
    { from: '*', to: 'idle', when: 'anim.speed <= 0.2' },
    { from: 'walk', to: 'idle' },
  ],
};

describe('an animator layer’s outline', () => {
  it('lists each state with the transitions it leaves by, numbered as read, and those from any state last', () => {
    expect(rowsOf(LAYER, 'base').map((r) => `${'  '.repeat(r.depth)}${r.text}`)).toEqual([
      'idle · plays idle · loops · starts',
      '  1. to walk when anim.speed > 0.2',
      'walk · plays walk · loops · by pace',
      '  3. to idle as its clip ends',
      '  2. to idle when anim.speed <= 0.2',
    ]);
    expect(rowsOf(LAYER, 'base')[4]?.path).toEqual(['base', 'transitions', 1]);
  });

  it('adds a state after the chosen one with a free id, and a transition read last', () => {
    const added = addState(LAYER, 'base', 0, 'idle');
    expect(added.layer.states?.map((s) => s.id)).toEqual(['idle', 'state', 'walk']);
    expect(added.path).toEqual(['base', 'states', 1]);
    const again = addState(added.layer, 'base', 2, undefined);
    expect(again.layer.states?.at(-1)).toEqual({ id: 'state-2' });
    const moved = addTransition(LAYER, 'upper', 'walk');
    expect(moved.layer.transitions?.at(-1)).toEqual({ from: 'walk', to: 'idle', when: 'anim.speed > 0.2' });
    expect(moved.path).toEqual(['upper', 'transitions', 3]);
  });

  it('moves a transition in the order they are read, and keeps it in its list', () => {
    const rows = rowsOf(LAYER, 'base');
    const last = rows[3] as (typeof rows)[number];
    expect(canMove(LAYER, last, 1)).toBe(false);
    const up = moveRow(LAYER, 'base', last, -1);
    expect(up.layer.transitions?.map((t) => `${t.from}>${t.to}`)).toEqual(['idle>walk', 'walk>idle', '*>idle']);
    expect(up.path).toEqual(['base', 'transitions', 1]);
  });

  it('removes a state with its transitions both ways, the first left starting, and keeps one', () => {
    const rows = rowsOf(LAYER, 'base');
    const gone = removeRow(LAYER, 'base', rows[0] as (typeof rows)[number]);
    expect(gone.layer.start).toBe('walk');
    expect(gone.layer.transitions).toEqual([]);
    const one = { start: 'walk', states: [{ id: 'walk' }] };
    expect(canRemove(one, rowsOf(one, 'base')[0] as (typeof rows)[number])).toBe(false);
    expect(removeRow(LAYER, 'base', rows[1] as (typeof rows)[number]).layer.transitions).toHaveLength(2);
  });
});
