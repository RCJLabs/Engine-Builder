/** An offered list's takes (M4.12): the action types it lists, checked against the game's actions. */
import { describe, expect, it } from 'vitest';
import { knownFrom } from './known.ts';
import { checkUi, type UiCheckOptions, type UiFile } from './uiCheck.ts';

const game: UiCheckOptions = {
  facts: knownFrom({ kits: ['inventory'], facts: knownFrom({}).facts }).facts,
  openFacts: false,
  kits: ['inventory'],
  actions: ['refit/fit', 'refit/strip', 'run/undock'],
  modes: ['hut'],
};

const only = (main: unknown) =>
  checkUi(new Map([['hud', { file: 'ui/hud.json', value: { shows: ['hut'], main } } as UiFile]]), undefined, game).map(
    ({ code, path, message }) => ({ code, path, message }),
  );

const offered = (takes: unknown, of = 'offered') => ({
  widget: 'list',
  of,
  takes,
  item: { widget: 'button', label: '{.label}', action: { take: 'entry' } },
});

describe('an offered list’s takes', () => {
  it('passes action types and module patterns the game has', () => {
    expect(only(offered(['refit/fit', 'refit/strip']))).toEqual([]);
    expect(only(offered(['refit/*']))).toEqual([]);
  });

  it('names a takes the game has no action for, at its place', () => {
    expect(only(offered(['refit/fit', 'refit/paint', 'dock/*']))).toEqual([
      { code: 'E049', path: '/main/takes/1', message: 'The game has no action "refit/paint"' },
      { code: 'E049', path: '/main/takes/2', message: 'The game has no action "dock/*"' },
    ]);
  });

  it('says only a list of offered has takes', () => {
    const bag = { ...offered(['refit/*'], 'bag'), item: { widget: 'text', text: '{.name}' } };
    expect(only(bag)).toEqual([
      { code: 'E049', path: '/main/takes', message: 'Only a list of offered has takes: this is a list of bag' },
    ]);
  });
});
