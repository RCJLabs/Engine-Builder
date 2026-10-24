import { describe, expect, it } from 'vitest';
import { lastShown } from './lastShown.ts';

describe('what the view was last shown', () => {
  it('shows a key once, and again only when it changes', () => {
    const shown = lastShown();
    expect(shown.due('a', true)).toBe(true);
    expect(shown.due('a', true)).toBe(false);
    expect(shown.due('b', true)).toBe(true);
    expect(shown.due('a', true)).toBe(true);
  });

  it('shows a key offered before the view existed once it does', () => {
    const shown = lastShown();
    expect(shown.due('a', false)).toBe(false);
    expect(shown.due('a', false)).toBe(false);
    expect(shown.due('a', true)).toBe(true);
    expect(shown.due('a', true)).toBe(false);
  });
});
