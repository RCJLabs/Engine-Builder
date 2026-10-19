/**
 * The talk map's layout (M3.8): rows by steps from a start, the lines nothing reaches last, where
 * each line leads, and a value caught half made, which never throws.
 */
import { describe, expect, it } from 'vitest';
import { talkMap } from './talkMap.ts';

const MARGE = {
  speaker: 'marge',
  starts: [{ if: 'dialogue.talked(talk: marge) >= 1', line: 'again' }, { line: 'hello' }],
  lines: [
    {
      id: 'hello',
      text: 'First time at the crag?',
      options: [
        { id: 'first', label: 'It is.', next: 'tour' },
        { id: 'been', label: 'I’ve been before.', next: 'again' },
      ],
    },
    { id: 'tour', text: 'The slab is the warm-up.', next: 'again' },
    {
      id: 'again',
      text: 'What are we doing today?',
      options: [
        { id: 'gas', label: 'Chip in for gas', cost: { cash: 10 }, next: 'thanks' },
        {
          id: 'send',
          label: 'Watch me send it',
          outcomes: [
            { chance: 60, effects: [], next: 'sent' },
            { chance: 40, effects: [] },
          ],
          next: 'again',
        },
        { id: 'bye', label: 'See you around.' },
      ],
    },
    { id: 'thanks', text: 'Appreciated.', next: 'again' },
    { id: 'sent', speaker: 'dex', text: 'Clean!' },
  ],
};

const ids = (rows: ReturnType<typeof talkMap>) => rows.map((row) => [row.steps, row.boxes.map((b) => b.id)]);
const box = (value: unknown, id: string) =>
  talkMap(value)
    .flatMap((r) => r.boxes)
    .find((b) => b.id === id);

describe('the talk map', () => {
  it('puts each line in the row of its fewest steps from a start, in the order written', () => {
    expect(ids(talkMap(MARGE))).toEqual([
      [0, ['hello', 'again']],
      [1, ['tour', 'thanks', 'sent']],
    ]);
  });

  it('says where each option, outcome and Then leads, and where the talk ends', () => {
    expect(box(MARGE, 'again')?.exits).toEqual([
      { by: '“Chip in for gas”', to: 'thanks', found: true },
      { by: '“Watch me send it”, 60%', to: 'sent', found: true },
      // An outcome with no line of its own goes where its option leads.
      { by: '“Watch me send it”, 40%', to: 'again', found: true },
      { by: '“See you around.”', to: undefined, found: true },
    ]);
    expect(box(MARGE, 'tour')?.exits).toEqual([{ by: 'Then', to: 'again', found: true }]);
    expect(box(MARGE, 'sent')?.exits).toEqual([{ by: 'Then', to: undefined, found: true }]);
    expect([box(MARGE, 'tour')?.speaker, box(MARGE, 'sent')?.speaker, box(MARGE, 'sent')?.index]).toEqual([
      'marge',
      'dex',
      4,
    ]);
  });

  it('puts the lines no start reaches last, a pair that leads only to each other and a second line of one id', () => {
    const lines = [
      ...MARGE.lines,
      { id: 'tick', text: 'Tick', next: 'tock' },
      { id: 'tock', text: 'Tock', next: 'tick' },
      { id: 'tour', text: 'Again?' },
    ];
    const rows = talkMap({ ...MARGE, lines });
    expect(ids(rows).at(-1)).toEqual([undefined, ['tick', 'tock', 'tour']]);
    expect(rows.at(-1)?.boxes.map((b) => b.index)).toEqual([5, 6, 7]);
  });

  it('marks an exit to a line the talk doesn’t have', () => {
    const lines = MARGE.lines.map((line) => (line.id === 'tour' ? { ...line, next: 'agian' } : line));
    expect(box({ ...MARGE, lines }, 'tour')?.exits).toEqual([{ by: 'Then', to: 'agian', found: false }]);
  });

  it('reads a value caught half made without throwing, leaving out what isn’t a talk’s shape', () => {
    for (const value of [undefined, null, 'talk', [], { lines: 'none' }, { starts: 3, lines: [3, null, {}] }]) {
      expect(talkMap(value), JSON.stringify(value)).toEqual([]);
    }
    const half = {
      starts: [{ line: 'a' }, { line: 4 }, 'b'],
      lines: [
        { id: 'a', text: 7, options: { id: 'x' } },
        {
          id: 'b',
          options: [{ next: 'a' }, { id: 'y', outcomes: [{ chance: '50', next: 'a' }, 9] }, { outcomes: [] }],
        },
      ],
    };
    expect(ids(talkMap(half))).toEqual([
      [0, ['a']],
      [undefined, ['b']],
    ]);
    expect(box(half, 'a')).toMatchObject({ text: '', exits: [{ by: 'Then', to: undefined }] });
    expect(box(half, 'b')?.exits.map((e) => `${e.by} → ${e.to}`)).toEqual([
      '“An option” → a',
      '“y”, ?% → a',
      '“y”, ?% → undefined',
      '“An option” → undefined',
    ]);
  });
});
