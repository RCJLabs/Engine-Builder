import { describe, expect, it } from 'vitest';
import { undoKey } from './undoKeys.ts';

const key = (k: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  undoKey({ key: k, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, shiftKey: !!mods.shift, altKey: !!mods.alt });

describe('undoKey', () => {
  it('reads Ctrl or ⌘ with Z as undo, and with Shift as redo, whatever the case', () => {
    expect([key('z', { ctrl: true }), key('z', { meta: true }), key('Z', { ctrl: true })]).toEqual([
      'undo',
      'undo',
      'undo',
    ]);
    expect([key('Z', { ctrl: true, shift: true }), key('z', { meta: true, shift: true })]).toEqual(['redo', 'redo']);
  });

  it('reads Ctrl+Y as redo, but not ⌘Y', () => {
    expect(key('y', { ctrl: true })).toBe('redo');
    expect(key('y', { meta: true })).toBeNull();
  });

  it('leaves other keys alone, Alt and bare Z included', () => {
    expect([key('z'), key('z', { ctrl: true, alt: true }), key('k', { ctrl: true })]).toEqual([null, null, null]);
  });
});
