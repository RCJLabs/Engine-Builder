import { describe, expect, it } from 'vitest';
import { NOTHING_ASKED, shownKits, stillAsked, withAsk } from './askedKits.ts';

describe('the kit boxes as asked', () => {
  it('shows a tick at once, with what it brings, while project.json still lists the kits as they were', () => {
    const asked = withAsk([], NOTHING_ASKED, 'roster', true);
    expect(shownKits([], asked)).toEqual(['stats', 'roster']);
    // A read that lands before the edit, as a new project's first read does, changes nothing shown.
    expect(stillAsked([], asked)).toBe(asked);
    expect(shownKits([], stillAsked([], asked))).toEqual(['stats', 'roster']);
  });

  it('keeps two ticks made in one task, each worked out from the one before it', () => {
    const one = withAsk([], NOTHING_ASKED, 'dialogue', true);
    const both = withAsk([], one, 'time', true);
    expect(shownKits([], both)).toEqual(['time', 'dialogue']);
  });

  it('drops each ask once project.json says the same, and keeps the rest', () => {
    const both = withAsk([], withAsk([], NOTHING_ASKED, 'dialogue', true), 'time', true);
    const left = stillAsked(['time'], both);
    expect([...left]).toEqual([['dialogue', true]]);
    expect(stillAsked(['time', 'dialogue'], left).size).toBe(0);
  });

  it('asks a cleared box off over what project.json lists, taking what needs it too', () => {
    const asked = withAsk(['inventory', 'economy'], NOTHING_ASKED, 'inventory', false);
    expect(shownKits(['inventory', 'economy'], asked)).toEqual([]);
    expect(stillAsked([], asked).size).toBe(0);
  });

  it('a tick and its clearing before either lands shows the box clear, until the file agrees', () => {
    const ticked = withAsk([], NOTHING_ASKED, 'time', true);
    const cleared = withAsk([], ticked, 'time', false);
    expect(shownKits([], cleared)).toEqual([]);
    // The tick lands first: the clearing is still asked.
    expect(shownKits(['time'], stillAsked(['time'], cleared))).toEqual([]);
  });
});
