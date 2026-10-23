import { describe, expect, it } from 'vitest';
import { RECORDS as CRAG, cragWith } from '../../../kits/test/crag.ts';
import type { Feedback } from '../format/feedback.ts';
import { startPlay } from './play.ts';
import { feedbackSayer } from './say.ts';

const crag = cragWith(CRAG, { first: 'marge', start: 'talking' });
const kits = ['inventory', 'economy', 'dialogue'];
const play = (feedback?: Feedback) =>
  startPlay(
    { game: crag.game, sim: crag.sim, kits, wants: { facts: [], conditions: [] }, ...(feedback ? { feedback } : {}) },
    'crag',
  );

describe('what a step says (M4.2)', () => {
  it('says each beat by the first line that matches it, a record’s id as its name', () => {
    const said = play({
      lines: [
        { on: 'dialogue/said', where: { option: 'first' }, say: 'You told her it’s your first time', to: 'toast' },
        { on: 'dialogue/said', say: '{.talk}: {.option}', to: 'log' },
        { on: 'inventory/gained', say: '{.item} ×{.count}' },
      ],
    });
    expect(said.act({ type: 'dialogue/say', option: 'first' }).said).toEqual([
      { text: 'You told her it’s your first time', to: 'toast' },
    ]);
    const again = play({ lines: [{ on: 'dialogue/said', say: '{.talk}: {.option}', to: 'log' }] });
    expect(again.act({ type: 'dialogue/say', option: 'been' }).said).toEqual([
      { text: 'Marge at the crag: been', to: 'log' },
    ]);
  });

  it('says beats in the order they came, each line to both unless it says otherwise', () => {
    const p = play({
      lines: [
        { on: 'dialogue/said', say: 'Said {.option}' },
        { on: 'dialogue/heard', say: 'Heard {.line}', to: 'log' },
      ],
    });
    const step = p.act({ type: 'dialogue/say', option: 'been' });
    const words = (type: string, beat: Record<string, unknown>) =>
      type === 'dialogue/said' ? `Said ${beat.option}` : `Heard ${beat.line}`;
    const expected = step.beats
      .filter((b) => b.type === 'dialogue/said' || b.type === 'dialogue/heard')
      .map((b) => words(b.type, b));
    expect(expected.length).toBeGreaterThan(1);
    expect(step.said.map((s) => s.text)).toEqual(expected);
    expect(step.said.find((s) => s.text.startsWith('Said'))?.to).toBe('both');
    expect(step.said.find((s) => s.text.startsWith('Heard'))?.to).toBe('log');
  });

  it('says nothing without feedback, or for a beat no line matches', () => {
    expect(play().act({ type: 'dialogue/say', option: 'first' }).said).toEqual([]);
    const p = play({ lines: [{ on: 'dialogue/said', where: { option: 'gear' }, say: 'Gear' }] });
    expect(p.act({ type: 'dialogue/say', option: 'first' }).said).toEqual([]);
  });

  it('shows a hole that isn’t an argument as no value, and words that don’t split as written', () => {
    const p = play({
      lines: [
        { on: 'dialogue/said', where: { option: 'first' }, say: '{time.day} {.nope}' },
        { on: 'dialogue/heard', say: 'Heard {' },
      ],
    });
    expect(p.act({ type: 'dialogue/say', option: 'first' }).said.map((s) => s.text)).toEqual(
      expect.arrayContaining(['— —']),
    );
    expect(p.act({ type: 'dialogue/say', option: 'first' }).said).toEqual([]);
  });
});

describe('what a step is felt as (M4.8)', () => {
  it('cues a line that only buzzes, which ends the search as a said line does', () => {
    const felt = feedbackSayer(
      {
        lines: [
          { on: 'hut/carried', buzz: 'knock' },
          { on: 'hut/carried', say: 'Never said: the line above felt it.', sound: 'load' },
          { on: 'hut/rested', sound: 'door' },
        ],
      },
      {},
    );
    expect(felt([{ type: 'hut/carried' }, { type: 'hut/rested' }], {} as never)).toEqual({
      said: [],
      cues: [{ buzz: 'knock' }, { sound: 'door' }],
    });
  });
});
