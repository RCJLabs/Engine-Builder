/**
 * Lines that pass and lines that branch (M3.11, docs/specs/dialogue.md#going-on), which ink
 * scenes compile into: a line without text that shows no option is passed over, its effects
 * applied, to where its branches or Then lead; a line goes on by its first branch whose If holds
 * before its Then; a branch that names no line ends the talk.
 */
import type { Condition, GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { cragWith, RECORDS } from '../../test/crag.ts';
import type { DialogueSlice } from './types.ts';

const flagOn = (flag: string): Condition => ({ fact: 'flag.on', args: { flag } });
const set = (flag: string) => ({ effect: 'set-flag', flag, to: true });

const letter = {
  starts: [{ line: 'open' }],
  lines: [
    { id: 'open', effects: [set('read')], branches: [{ if: flagOn('permit'), line: 'permitted' }], next: 'plain' },
    {
      id: 'permitted',
      text: 'You have a permit.',
      branches: [{ if: flagOn('knows-arete'), line: 'friend' }],
      next: 'after',
    },
    { id: 'after', branches: [{ if: flagOn('permit') }], next: 'plain' },
    { id: 'friend', text: 'And a friend.' },
    { id: 'plain', text: 'No permit.', next: 'pick' },
    {
      id: 'pick',
      options: [
        { id: 'a', label: 'A', once: true, next: 'pick' },
        { id: 'b', label: 'B', if: flagOn('knows-arete'), next: 'friend' },
      ],
    },
  ],
};

// A flag compared with a number: neither true nor false, so no branch is taken on it.
const neither: Condition = { fact: 'flag.on', args: { flag: 'permit' }, op: '==', value: 3 };
const gate = {
  starts: [{ line: 'gate' }],
  lines: [
    {
      id: 'gate',
      text: 'The gate.',
      branches: [
        { if: neither, line: 'wrong' },
        { if: flagOn('permit'), line: 'through' },
      ],
    },
    { id: 'through', text: 'Through.', branches: [{ if: flagOn('permit') }], next: 'wrong' },
    { id: 'wrong', text: 'Wrong.' },
  ],
};

const records = { ...RECORDS, flag: { ...RECORDS.flag, read: {} }, talk: { ...RECORDS.talk, letter, gate } };
const { start, apply, visit, say, goOn, fact, view } = cragWith(records);
const slice = (state: GameState) => state.dialogue as DialogueSlice;
const types = (beats: readonly { type: string }[]) => beats.map((b) => b.type).filter((t) => t.startsWith('dialogue/'));
const done = (result: ReturnType<typeof say>) => {
  if (!result.accepted) throw new Error(`Refused: ${JSON.stringify(result.beats[0])}`);
  return result;
};

describe('a line without text', () => {
  it('is passed over as the talk reaches it: counted, its effects applied, gone on from at once', () => {
    const opened = visit(start(), 'letter');
    expect(slice(opened).open).toEqual({ talk: 'letter', line: 'plain' });
    expect(slice(opened).heard.letter).toEqual({ open: 1, plain: 1 });
    expect(fact(opened, 'flag.on', { flag: 'read' })).toBe(true);
    expect(view(opened, 'letter')).toMatchObject({ line: 'plain', text: 'No permit.', 'go-on': 'next' });
  });

  it('with options shows them alone, and passes once none is shown', () => {
    const picking = done(goOn(visit(start(), 'letter'))).state;
    const shown = view(picking, 'letter');
    expect(shown).toMatchObject({ line: 'pick', options: [{ id: 'a', open: true }] });
    expect(shown).not.toHaveProperty('text');
    const ended = done(say(picking, 'a'));
    expect(types(ended.beats)).toEqual(['dialogue/said', 'dialogue/heard', 'dialogue/ended']);
    expect(slice(ended.state).open).toBeUndefined();
  });

  it('that passes to another in a loop throws', () => {
    const looped = {
      starts: [{ line: 'x' }],
      lines: [
        { id: 'x', next: 'y' },
        { id: 'y', next: 'x' },
      ],
    };
    const loop = cragWith({ ...records, talk: { ...records.talk, looped } });
    expect(() => loop.visit(loop.start(), 'looped')).toThrow(/passes in a loop/);
  });
});

describe('branches', () => {
  it('lead on by the first whose If holds, before the Then', () => {
    const permitted = apply(start(), set('permit'));
    const opened = visit(permitted, 'letter');
    expect(slice(opened).open?.line).toBe('permitted');
    const friendly = visit(apply(permitted, set('knows-arete')), 'letter');
    expect(view(friendly, 'letter')).toMatchObject({ line: 'permitted', 'go-on': 'next' });
    expect(slice(done(goOn(friendly)).state).open?.line).toBe('friend');
  });

  it('are taken only on an If that is true, and say whether going on ends the talk', () => {
    expect(view(visit(start(), 'gate'), 'gate')).toMatchObject({ line: 'gate', 'go-on': 'end' });
    const opened = visit(apply(start(), set('permit')), 'gate');
    expect(view(opened, 'gate')).toMatchObject({ line: 'gate', 'go-on': 'next' });
    const through = done(goOn(opened)).state;
    expect(slice(through).open?.line).toBe('through');
    // Its branch names no line, so going on ends the talk, though it has a Then.
    expect(view(through, 'gate')).toMatchObject({ line: 'through', 'go-on': 'end' });
  });

  it('end the talk when the one that holds names no line, passed over or gone on from', () => {
    const opened = visit(apply(start(), set('permit')), 'letter');
    const ended = done(goOn(opened));
    expect(types(ended.beats)).toEqual(['dialogue/heard', 'dialogue/ended']);
    expect(slice(ended.state).heard.letter).toMatchObject({ after: 1 });
    expect(slice(ended.state).open).toBeUndefined();
  });
});
