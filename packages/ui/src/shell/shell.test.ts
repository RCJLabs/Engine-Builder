import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, readSettings, settingsAttrs, settingsKey } from './settings.ts';
import { continueSlot, DAILY_SLOT, dailyNumber, dailySeed, slotIds, slotInfo, slotName } from './slots.ts';

const summary = (slot: string, savedAt: number, fields: Record<string, unknown> = {}) =>
  ({ slot, readable: true, savedAt, build: 'b', summary: fields }) as const;

describe('slots', () => {
  it('names numbered slots and the Daily', () => {
    expect(slotIds(3)).toEqual(['slot-1', 'slot-2', 'slot-3']);
    expect(slotName('slot-2')).toBe('Slot 2');
    expect(slotName(DAILY_SLOT)).toBe('Daily');
    expect(slotName('other')).toBe('other');
  });

  it('shows a slot by its line, else its step, and a summary it can’t read as such', () => {
    expect(slotInfo(summary('slot-1', 5, { line: 'Day 3', turn: 9 }))).toEqual({
      slot: 'slot-1',
      readable: true,
      savedAt: 5,
      line: 'Day 3',
      daily: undefined,
    });
    expect(slotInfo(summary('slot-1', 5, { turn: 9 }))).toMatchObject({ line: 'Step 9' });
    expect(slotInfo(summary('slot-1', 5, { line: 7, turn: 'x' }))).toMatchObject({ line: 'Step 0' });
    expect(slotInfo(summary(DAILY_SLOT, 5, { daily: 293 }))).toMatchObject({ daily: 293 });
    expect(slotInfo(summary(DAILY_SLOT, 5, { daily: 2.5 }))).toMatchObject({ daily: undefined });
    expect(slotInfo({ slot: 'slot-2', readable: false })).toEqual({ slot: 'slot-2', readable: false });
  });

  it('continues the numbered slot played last, never the Daily or one it can’t read', () => {
    // Newest first, as the platform lists them.
    const list = [slotInfo(summary(DAILY_SLOT, 9)), slotInfo(summary('slot-2', 8)), slotInfo(summary('slot-1', 7))];
    expect(continueSlot(list)?.slot).toBe('slot-2');
    expect(continueSlot([{ slot: 'slot-3', readable: false }, ...list.slice(2)])?.slot).toBe('slot-1');
    expect(continueSlot([list[0] as never])).toBeUndefined();
    expect(continueSlot([])).toBeUndefined();
  });

  it('numbers the Daily by the local date from 2026-01-01, whatever the hour', () => {
    expect(dailyNumber(new Date(2026, 0, 1, 0, 0))).toBe(0);
    expect(dailyNumber(new Date(2026, 0, 1, 23, 59))).toBe(0);
    expect(dailyNumber(new Date(2026, 0, 2, 0, 1))).toBe(1);
    // Across the spring clock change, a day is still one.
    expect(dailyNumber(new Date(2026, 2, 30, 12))).toBe(88);
    expect(dailyNumber(new Date(2026, 9, 20, 3))).toBe(292);
    expect(dailyNumber(new Date(2027, 0, 1))).toBe(365);
    expect(dailySeed(292)).toBe('daily:292');
  });

  it('counts the Daily by the device’s own calendar, not UTC’s, where the two dates differ', () => {
    const was = process.env.TZ;
    try {
      // Fourteen hours ahead of UTC: noon UTC on the 19th is two in the morning of the 20th there.
      process.env.TZ = 'Pacific/Kiritimati';
      expect(dailyNumber(new Date(Date.UTC(2026, 9, 19, 12)))).toBe(292);
      process.env.TZ = 'Pacific/Pago_Pago';
      // Eleven hours behind: eight in the morning UTC on the 20th is still the 19th there.
      expect(dailyNumber(new Date(Date.UTC(2026, 9, 20, 8)))).toBe(291);
    } finally {
      if (was === undefined) delete process.env.TZ;
      else process.env.TZ = was;
    }
  });
});

describe('settings', () => {
  it('reads each field on its own, falling back alone', () => {
    expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings('{"torn')).toEqual(DEFAULT_SETTINGS);
    expect(readSettings('[1]')).toEqual(DEFAULT_SETTINGS);
    expect(readSettings('{"text":"larger","motion":"sideways"}')).toEqual({ text: 'larger', motion: 'device' });
    expect(readSettings('{"text":"huge","motion":"less"}')).toEqual({ text: 'normal', motion: 'less' });
  });

  it('puts the text scale and a motion that isn’t the device’s on the root', () => {
    expect(settingsAttrs(DEFAULT_SETTINGS)).toEqual({ style: { '--eb-text-scale': '1' } });
    expect(settingsAttrs({ text: 'large', motion: 'less' })).toEqual({
      style: { '--eb-text-scale': '1.2' },
      'data-motion': 'less',
    });
    expect(settingsAttrs({ text: 'larger', motion: 'full' })).toMatchObject({
      style: { '--eb-text-scale': '1.4' },
      'data-motion': 'full',
    });
    expect(settingsKey('hut', 'play')).toBe('eb/hut/play/settings');
  });
});
