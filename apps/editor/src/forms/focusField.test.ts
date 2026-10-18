import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { focusField } from './focusField.ts';

// The browser's CSS.escape: the pointers here need nothing escaped.
beforeEach(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** A form as focusField reads it: a box per pointer, with a control in it or none. */
function form(boxes: Record<string, boolean>) {
  const focused: string[] = [];
  const control = (at: string) => ({ focus: () => focused.push(at), scrollIntoView: () => {} });
  const root = {
    querySelector(selector: string) {
      const at = /^\[data-at="(.*)"\]$/.exec(selector)?.[1];
      if (at === undefined || !Object.hasOwn(boxes, at)) return null;
      return { querySelector: () => (boxes[at] ? control(at) : null) };
    },
  };
  return { root: root as unknown as ParentNode, focused };
}

it('focuses the field at the pointer', () => {
  const { root, focused } = form({ '/might': true, '/record': true, '/record/wins': true });
  expect(focusField(root, '/record/wins')).toBe(true);
  expect(focused).toEqual(['/record/wins']);
});

it('walks up to the nearest field holding the pointer, as a field shows its problems', () => {
  // A condition's tree is one field: a problem deep in it opens the condition.
  const { root, focused } = form({ '/fights': true, '/might': true });
  expect(focusField(root, '/fights/all/0/fact')).toBe(true);
  expect(focused).toEqual(['/fights']);
});

it('passes a box with no control in it, and says when no field holds the pointer', () => {
  const { root, focused } = form({ '/record': true, '/record/wins': false });
  expect(focusField(root, '/record/wins')).toBe(true);
  expect(focused).toEqual(['/record']);
  expect(focusField(form({ '/might': true }).root, '/kit/gladius')).toBe(false);
});
