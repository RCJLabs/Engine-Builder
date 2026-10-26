/**
 * What the stage is told of the tracked quest (M6.6, D78, docs/specs/markers.md#what-the-stage-is-told):
 * its open objectives with a target, slots bound (a flag with no name shows its id), and nothing once
 * they are done, of a quest not tracked, or without the quests kit.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { dockWith, set, withQuest } from '../../../kits/test/dock.ts';
import { markersOf } from './markers.ts';

const on = (flag: string) => ({ fact: 'flag.on', args: { flag } });
const HUNT = {
  name: 'The hunt',
  'at-start': true,
  slots: [{ id: 'mark', type: 'flag', record: 'alarm' }],
  stages: [
    {
      id: 'find',
      objectives: [
        { id: 'see', text: 'Find {mark}', 'done-when': on('loop'), target: { actor: '@mark' } },
        {
          id: 'hatch',
          text: 'Open the hatch',
          'done-when': on('met-chief'),
          target: { space: 'hold', object: 'hatch' },
        },
        { id: 'wait', text: 'Wait', 'done-when': on('ready') },
      ],
    },
  ],
};

const dock = dockWith(withQuest('hunt', HUNT));
const reading = (state: GameState) => ({
  fact: (id: string, args?: Readonly<Record<string, unknown>>) => dock.fact(state, id, args as Record<string, unknown>),
  preview: (effect: { readonly effect: string }) => dock.game.preview(state, [effect as never], dock.sim)[0],
});
const track = (state: GameState, quest: string) => dock.step(state, { type: 'quests/track', quest });

describe('markersOf', () => {
  it('is the tracked quest’s open objectives with a target, in order, slots bound', () => {
    const hunting = track(dock.start(), 'hunt');
    expect(markersOf(reading(hunting), ['quests'])).toEqual([
      { quest: 'hunt', objective: 'see', text: 'Find alarm', target: { actor: 'alarm' } },
      { quest: 'hunt', objective: 'hatch', text: 'Open the hatch', target: { space: 'hold', object: 'hatch' } },
    ]);
  });

  it('leaves out an objective done, and a quest not tracked', () => {
    const hunting = track(dock.start(), 'hunt');
    const seen = dock.apply(hunting, set('loop'));
    expect(markersOf(reading(seen), ['quests']).map((m) => m.objective)).toEqual(['hatch']);
    expect(markersOf(reading(track(seen, 'debt')), ['quests'])).toEqual([]);
  });

  it('is none without the quests kit', () => {
    expect(markersOf(reading(track(dock.start(), 'hunt')), ['inventory'])).toEqual([]);
  });
});
