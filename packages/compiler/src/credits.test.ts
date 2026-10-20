import { describe, expect, it } from 'vitest';
import { creditsOf } from './credits.ts';

const logged = (files: Record<string, unknown>) => ({ ok: true as const, value: { files } });
const rope = { licence: 'CC-BY-4.0', source: 'https://example.org', date: '2026-10-20', author: 'Ana', prompt: 'p' };

describe('creditsOf (M4.4)', () => {
  it('credits each logged file assets/ holds, in path order, without what the log keeps for itself', () => {
    const log = logged({ 'b/rope.png': rope, 'a/axe.png': { licence: 'own', source: 'Drawn', date: '2026-10-20' } });
    expect(creditsOf(log, new Set(['a/axe.png', 'b/rope.png']))).toEqual([
      { asset: 'a/axe.png', licence: 'own', licenceName: 'Own work', source: 'Drawn' },
      {
        asset: 'b/rope.png',
        licence: 'CC-BY-4.0',
        licenceName: 'CC BY 4.0',
        source: 'https://example.org',
        author: 'Ana',
      },
    ]);
  });

  it('leaves out a file the log names that isn’t there, and credits nothing from a log that didn’t read', () => {
    expect(creditsOf(logged({ 'gone.png': rope }), new Set(['other.png']))).toEqual([]);
    expect(creditsOf({ ok: false, message: 'Not JSON' }, new Set(['gone.png']))).toEqual([]);
    expect(creditsOf(undefined, new Set())).toEqual([]);
  });
});
