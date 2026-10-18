import { describe, expect, it } from 'vitest';
import { typedAhead } from './typedAhead.ts';

describe('typing in flight in the script editor', () => {
  it('knows its own typing as it lands, and an undo after it as the file’s', () => {
    const typing = typedAhead();
    typing.send('a');
    typing.send('ab');
    // A read from before the typing landed: about to be overtaken, not shown.
    expect(typing.read('')).toBe('wait');
    expect(typing.read('a')).toBe('ours');
    expect(typing.read('ab')).toBe('ours');
    // Nothing in flight: an undo's text is shown.
    expect(typing.read('')).toBe('show');
  });

  it('takes an edit as landed when a later one is read, the reads of each having merged', () => {
    const typing = typedAhead();
    typing.send('a');
    typing.send('ab');
    typing.send('abc');
    expect(typing.read('abc')).toBe('ours');
    expect(typing.read('x')).toBe('show');
  });

  it('lets go of an edit that changed nothing, which is never read back', () => {
    const typing = typedAhead();
    const landed = typing.send('same');
    expect(typing.read('other')).toBe('wait');
    landed();
    expect(typing.read('other')).toBe('show');
  });

  it('keeps the same text typed twice apart, each landing once', () => {
    const typing = typedAhead();
    typing.send('a');
    typing.send('');
    typing.send('a');
    expect(typing.read('a')).toBe('ours');
    expect(typing.read('')).toBe('ours');
    expect(typing.read('a')).toBe('ours');
    expect(typing.read('')).toBe('show');
  });
});
