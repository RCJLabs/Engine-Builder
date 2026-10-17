import { describe, expect, it, vi } from 'vitest';

/**
 * A hook runtime stepped by hand: state updates queue until the next render, and effects run
 * only when the test says. So a key can be pressed between a render and its effects, the moment
 * the browser hit by chance in M2.4 (the lost "n" of "trident"). preact/hooks is replaced with it.
 */
const hooks = vi.hoisted(() => {
  let states: unknown[] = [];
  let queued: [number, unknown][] = [];
  let effects: (() => void)[] = [];
  let deps: unknown[][] = [];
  let nextState = 0;
  let nextEffect = 0;
  return {
    useState(initial: unknown) {
      const i = nextState++;
      if (!(i in states)) states[i] = initial;
      return [states[i], (update: unknown) => queued.push([i, update])];
    },
    useEffect(run: () => void, given: unknown[]) {
      const i = nextEffect++;
      const before = deps[i];
      if (!before || given.some((d, j) => !Object.is(d, before[j]))) {
        deps[i] = given;
        effects.push(run);
      }
    },
    render<T>(component: () => T): T {
      for (const [i, update] of queued) {
        states[i] = typeof update === 'function' ? (update as (now: unknown) => unknown)(states[i]) : update;
      }
      queued = [];
      nextState = 0;
      nextEffect = 0;
      return component();
    },
    runEffects() {
      const due = effects;
      effects = [];
      for (const run of due) run();
    },
    reset() {
      states = [];
      queued = [];
      effects = [];
      deps = [];
    },
  };
});

vi.mock('preact/hooks', () => ({ useState: hooks.useState, useEffect: hooks.useEffect }));

const { useDraft } = await import('./draft.ts');

describe('useDraft', () => {
  it('keeps a key pressed after the stored value caught up but before the field heard so', () => {
    hooks.reset();
    let stored = 'trid';
    let field = hooks.render(() => useDraft(stored));
    hooks.runEffects();
    field.setDraft('tride');
    field = hooks.render(() => useDraft(stored));
    expect(field.shown).toBe('tride');
    // The edit for "tride" lands: the field renders with the stored value caught up...
    stored = 'tride';
    field = hooks.render(() => useDraft(stored));
    // ...and "n" is pressed before that render's effects run.
    field.setDraft('triden');
    hooks.runEffects();
    field = hooks.render(() => useDraft(stored));
    expect(field.shown).toBe('triden');
  });

  it('lets the draft go once the stored value has caught up, or when the field is left', () => {
    hooks.reset();
    let stored = 'a';
    let field = hooks.render(() => useDraft(stored));
    field.setDraft('ab');
    field = hooks.render(() => useDraft(stored));
    hooks.runEffects();
    stored = 'ab';
    field = hooks.render(() => useDraft(stored));
    hooks.runEffects();
    field = hooks.render(() => useDraft(stored));
    expect(field.draft).toBeNull();
    field.setDraft('abc');
    field = hooks.render(() => useDraft(stored));
    field.clear();
    field = hooks.render(() => useDraft(stored));
    expect(field.shown).toBe('ab');
  });
});
