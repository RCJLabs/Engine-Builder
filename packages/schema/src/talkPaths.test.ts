/**
 * The walk of a talk's ways (M3.11) on its own: a loop that passes the same branch again adds
 * nothing to what the walk knows, so it settles rather than running to WALK_LIMIT.
 */
import type { TalkRecord } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { ENGINE_FACTS } from './known.ts';
import { endless, walkTalk } from './talkPaths.ts';

const X = { fact: 'flag.on', args: { flag: 'x' } };
const FACTS = {
  ...ENGINE_FACTS,
  'dialogue.heard': {
    args: { talk: { type: 'ref', to: 'talk' }, line: { type: 'text' } },
    domain: { type: 'int', min: 0 },
  },
} as const;
const heard = (op: '==' | '>', value: number) => ({
  fact: 'dialogue.heard',
  args: { talk: 't', line: 'a' },
  op,
  value,
});

describe('walkTalk', () => {
  it('settles on a loop that passes the same branch again', () => {
    const talk: TalkRecord = {
      starts: [{ line: 'wait' }],
      lines: [
        { id: 'wait', text: 'Still waiting.', branches: [{ if: X, line: 'wait' }] },
        { id: 'pace', text: 'You pace.', options: [{ id: 'again', label: 'Again', if: X, next: 'pace' }] },
      ],
    };
    // A few steps settle it; without that, each pass would know one more X, and the walk would run out.
    const walk = walkTalk(talk, ENGINE_FACTS, 50);
    expect(walk.complete).toBe(true);
    expect([...walk.branches]).toEqual(['wait/0']);
    const paced = walkTalk({ ...talk, starts: [{ line: 'pace' }] }, ENGINE_FACTS, 50);
    expect(paced.complete).toBe(true);
    expect([...paced.options]).toEqual(['pace/0']);
  });

  it('knows at each start that the starts before it didn’t hold', () => {
    const talk: TalkRecord = {
      starts: [{ if: X, line: 'yes' }, { line: 'no' }],
      lines: [
        { id: 'yes', text: 'Yes.' },
        { id: 'no', text: 'No.', branches: [{ if: X, line: 'yes' }] },
      ],
    };
    expect([...walkTalk(talk, ENGINE_FACTS).branches]).toEqual([]);
  });

  it('forgets what it knew of the dialogue kit’s facts once a line is shown', () => {
    const talk: TalkRecord = {
      starts: [{ if: heard('==', 0), line: 'a' }],
      lines: [
        { id: 'a', text: 'First time.', next: 'b' },
        { id: 'b', text: 'Again?', branches: [{ if: heard('>', 0), line: 'c' }] },
        { id: 'c', text: 'Yes, again.' },
      ],
    };
    expect([...walkTalk(talk, FACTS).branches]).toEqual(['b/0']);
  });
});

describe('endless', () => {
  it('counts a branch that names no line as a way to end', () => {
    const tock = { id: 'tock', text: 'Tock.', next: 'tick' };
    const tick = (line?: string) => ({
      id: 'tick',
      text: 'Tick.',
      branches: [{ if: X, ...(line ? { line } : {}) }],
      next: 'tock',
    });
    expect(endless({ starts: [{ line: 'tick' }], lines: [tick(), tock] })).toEqual(new Set());
    expect(endless({ starts: [{ line: 'tick' }], lines: [tick('tock'), tock] })).toEqual(new Set(['tick', 'tock']));
  });
});
