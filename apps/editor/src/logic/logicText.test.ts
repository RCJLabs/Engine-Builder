import { ENGINE_EVENTS, ENGINE_FACTS } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { holdsText } from './LogicBrowser.tsx';
import { doText, effectText, ifText, whenText } from './rowText.ts';
import { forEvent, moved, newEffect, newRow, newRowId, withArg, without } from './sheetEdits.ts';

describe('a row in words', () => {
  it('names the event by its label, with the arguments asked for', () => {
    expect(whenText({ event: 'flag/changed', args: { flag: 'met' } }, ENGINE_EVENTS)).toBe(
      'When a flag changes (flag: met)',
    );
    expect(whenText({ event: 'sheet/fired' }, ENGINE_EVENTS)).toBe('When a row runs');
    expect(whenText({ event: 'voyage/arrived', args: { day: 3 } }, ENGINE_EVENTS)).toBe('When voyage/arrived (day: 3)');
    expect(whenText({ event: '' }, ENGINE_EVENTS)).toBe('When an event not yet chosen');
  });

  it('reads the condition as describe does, text or tree, and shows text that doesn’t parse as written', () => {
    expect(ifText('flag.on(met)', ENGINE_FACTS)).toBe('If met is on');
    expect(ifText({ not: { fact: 'flag.on', args: { flag: 'met' } } }, ENGINE_FACTS)).toBe('If not met is on');
    expect(ifText('flag.on(', ENGINE_FACTS)).toBe('If flag.on(');
    expect(ifText(undefined, ENGINE_FACTS)).toBeUndefined();
  });

  it('says what each effect does, in the order written', () => {
    expect(
      doText([
        { effect: 'set-flag', flag: 'met', to: true },
        { effect: 'add-to-flag', flag: 'raids', by: -2 },
        { effect: 'roll', outcomes: [{ chance: 70 }, { chance: 30 }] },
        { effect: 'loot', table: 'wreck' },
      ]),
    ).toBe('Do: set met to on, then take 2 from raids, then roll 70 / 30, then loot');
    expect(effectText({ effect: 'set-flag', flag: '', to: 4 })).toBe('set a flag not yet chosen to 4');
    expect(effectText({ effect: '' })).toBe('an effect not yet named');
    expect(doText([])).toBe('Does nothing yet');
  });

  it('says what a flag holds', () => {
    expect(holdsText({ name: 'Met' })).toBe('On or off: starts off');
    expect(holdsText({ number: { min: 0, max: 10, start: 2 } })).toBe('A number from 0 to 10: starts at 2');
    expect(holdsText({ number: { max: 3 } })).toBe('A number up to 3: starts at 0');
  });
});

describe('sheet edits', () => {
  it('names a new row by the first free row-n, and starts it sound', () => {
    expect(newRowId([])).toBe('row-1');
    expect(newRowId([{ id: 'row-1' }, { id: 'row-3' }])).toBe('row-2');
    expect(newRow([{ id: 'row-1' }])).toEqual({ id: 'row-2', when: { event: 'flag/changed' }, do: [] });
  });

  it('moves and takes out items, leaving what it was given as it was', () => {
    const list = ['a', 'b', 'c'];
    expect(moved(list, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moved(list, 2, 3)).toEqual(list);
    expect(without(list, 1)).toEqual(['a', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('sets and clears an event’s argument, leaving args out once none is left', () => {
    const when = { event: 'flag/changed' };
    const set = withArg(when, 'flag', 'met');
    expect(set).toEqual({ event: 'flag/changed', args: { flag: 'met' } });
    expect(withArg(set, 'flag', undefined)).toEqual({ event: 'flag/changed' });
    expect(when).toEqual({ event: 'flag/changed' });
    expect(forEvent('sheet/fired')).toEqual({ event: 'sheet/fired' });
  });

  it('makes each new effect a copy of its own', () => {
    const a = newEffect('roll');
    const b = newEffect('roll');
    expect(a).toEqual(b);
    const outcomes = (effect: unknown) => (effect as { outcomes: unknown[] }).outcomes;
    expect(outcomes(a)).not.toBe(outcomes(b));
  });
});
