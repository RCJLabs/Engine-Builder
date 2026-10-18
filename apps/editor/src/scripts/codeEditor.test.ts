import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { CTX_API, EB_API, MODULE_API, RNG_API } from '@eb/script';
import { describe, expect, it } from 'vitest';
import { changeBetween } from './codeEditor.ts';
import { scriptCompletions } from './completions.ts';

const NAMES = {
  facts: ['hold.count'],
  events: ['hold/looted'],
  effects: ['stash'],
  records: new Map([['flag', ['full']]]),
};

describe('the change a file brings to the editor', () => {
  it('is only what differs, so the cursor elsewhere stays put', () => {
    expect(changeBetween('let a = 1;', 'let a = 12;')).toEqual({ from: 9, to: 9, insert: '2' });
    expect(changeBetween('abcdef', 'abXYef')).toEqual({ from: 2, to: 4, insert: 'XY' });
    expect(changeBetween('aaa', 'aa')).toEqual({ from: 2, to: 3, insert: '' });
    // Grown by what it already ends with: the common start and end must not overlap.
    expect(changeBetween('aa', 'aaa')).toEqual({ from: 2, to: 2, insert: 'a' });
    expect(changeBetween('', 'new')).toEqual({ from: 0, to: 0, insert: 'new' });
    expect(changeBetween('same', 'same')).toEqual({ from: 4, to: 4, insert: '' });
    for (const [a, b] of [
      ['import { x } from "eb";', 'import { x, y } from "eb";'],
      ['ababab', 'abab'],
      ['abab', 'ababab'],
      ['x', ''],
    ] as const) {
      const { from, to, insert } = changeBetween(a, b);
      expect(a.slice(0, from) + insert + a.slice(to)).toBe(b);
    }
  });
});

/** What completion offers with the cursor at the end of `text`. */
function offered(text: string, explicit = false): { from: number; labels: string[] } | null {
  const state = EditorState.create({ doc: text });
  const result = scriptCompletions(() => NAMES)(new CompletionContext(state, text.length, explicit));
  return result && { from: result.from, labels: result.options.map((o) => o.label) };
}

describe('completion from the engine’s API list', () => {
  it('offers a handler’s ctx after "ctx.", and an rng stream’s after "rng(…).", from the dot', () => {
    expect(offered('ctx.wr')).toEqual({ from: 4, labels: CTX_API.map((e) => e.name) });
    expect(offered("ctx.rng('pay').in")).toEqual({ from: 15, labels: RNG_API.map((e) => e.name) });
  });

  it('offers defineModule’s parts where a name of its own starts, and nowhere deeper', () => {
    const parts = MODULE_API.map((e) => e.name);
    expect(offered('defineModule<State>({\n  ac')).toEqual({ from: 24, labels: parts });
    expect(offered("defineModule({\n  id: 'x',\n  ", true)?.labels).toEqual(parts);
    expect(offered('defineModule({\n  actions: {\n    lo')?.labels).toEqual(EB_API.map((e) => e.name));
    expect(offered('const options = {\n  ac')?.labels).toEqual(EB_API.map((e) => e.name));
  });

  it('offers the project’s own names in a string: facts, events, effects, types and records', () => {
    expect(offered("ctx.fact('ho")).toEqual({
      from: 10,
      labels: ['hold.count', 'hold/looted', 'stash', 'flag', 'full'],
    });
  });

  it('offers what "eb" gives for a word, and nothing after another thing’s dot', () => {
    expect(offered('import { define')).toEqual({ from: 9, labels: EB_API.map((e) => e.name) });
    expect(offered('state.co')).toBeNull();
    expect(offered('')).toBeNull();
    expect(offered('', true)?.labels).toContain('defineModule');
  });
});
