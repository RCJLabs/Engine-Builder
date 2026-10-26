/**
 * An objective's target in the quest form (M6.6): the actors and the quest's actor slots, the spaces,
 * and the objects of the space the target names; nothing for any other field.
 */
import { describe, expect, it } from 'vitest';
import { targetChoices } from './targetChoices.ts';

const sources = {
  actors: ['warden', 'ada'],
  spaces: ['shed', 'glen'],
  objects: new Map([['glen', new Set(['rope', 'bothy-door'])]]),
};
const quest = {
  slots: [
    { id: 'helper', type: 'actor' },
    { id: 'tool', type: 'item' },
  ],
  stages: [
    {
      id: 'go',
      objectives: [
        { id: 'o', text: 'O', target: { space: 'glen' } },
        { id: 'p', text: 'P' },
      ],
    },
  ],
};
const at = (o: number, field: string) => ['stages', 0, 'objectives', o, 'target', field];

describe('targetChoices', () => {
  it('offers the actors then the quest’s actor slots, and the spaces, sorted', () => {
    expect(targetChoices(quest, sources, at(0, 'actor'))).toEqual(['ada', 'warden', '@helper']);
    expect(targetChoices(quest, sources, at(0, 'space'))).toEqual(['glen', 'shed']);
  });

  it('offers the objects of the space the target names, and none before one is named', () => {
    expect(targetChoices(quest, sources, at(0, 'object'))).toEqual(['bothy-door', 'rope']);
    expect(targetChoices(quest, sources, at(1, 'object'))).toEqual([]);
  });

  it('offers nothing for a field that isn’t a target’s', () => {
    expect(targetChoices(quest, sources, ['stages', 0, 'objectives', 0, 'text'])).toBeUndefined();
    expect(targetChoices(quest, sources, ['name'])).toBeUndefined();
  });
});
