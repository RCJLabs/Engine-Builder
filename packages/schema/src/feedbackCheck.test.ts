/** M4.2's checks of ui/: the feedback (E047, E048, E051, E052), the log widget, and W134. */
import type { EventCatalog, RecordIndex } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { knownFrom } from './known.ts';
import { checkUi, type UiCheckOptions, type UiFile } from './uiCheck.ts';

const records: RecordIndex = {
  ids: (type) => (type === 'item' ? ['rope'] : type === 'sound' ? ['door'] : []),
  has: (type, id) => (type === 'item' && id === 'rope') || (type === 'sound' && id === 'door'),
};
const events: EventCatalog = {
  'inventory/gained': { args: { item: { type: 'ref', to: 'item' }, count: { type: 'int', min: 1 } } },
  'hut/visited': { args: { who: { type: 'enum', values: ['greta', 'anselm'] } } },
  'hut/closed': { args: {} },
};
const game: UiCheckOptions = {
  facts: knownFrom({ kits: ['inventory', 'time'] }).facts,
  openFacts: false,
  kits: ['inventory', 'time'],
  actions: ['hut/rest'],
  modes: ['hut'],
  events,
  records,
};
const hud = { shows: ['hut'], main: { widget: 'text', text: '' } };
const files = (screens: Record<string, unknown>): Map<string, UiFile> =>
  new Map(Object.entries(screens).map(([id, value]) => [id, { file: `ui/${id}.json`, value }]));
const said = (lines: unknown, options: UiCheckOptions = game) =>
  checkUi(files({ hud }), undefined, options, { file: 'ui/feedback.json', value: { lines } }).map(
    ({ code, path, message }) => ({ code, path, message }),
  );

describe('feedback', () => {
  it('passes lines on events the game declares, matching and saying their arguments', () => {
    expect(
      said([
        { on: 'inventory/gained', say: '{.item} ×{.count} into the bag' },
        { on: 'hut/visited', where: { who: 'greta' }, say: 'Greta has news.', to: 'toast' },
        { on: 'inventory/gained', where: { item: 'rope', count: 2 }, say: 'Two ropes', to: 'log' },
        { on: 'hut/closed', say: 'The hut is shut for the winter.', to: 'both' },
      ]),
    ).toEqual([]);
  });

  it('gives a file of the wrong shape as E047 at its path', () => {
    expect(said([{ on: 'hut/closed', say: 'Shut', to: 'everywhere' }])).toEqual([
      expect.objectContaining({ code: 'E047', path: '/lines/0/to' }),
    ]);
    // A line with nothing to say, sound or buzz is wrong as a whole (M4.8).
    expect(said([{ on: 'hut/closed', words: 'Shut' }]).map((d) => [d.code, d.path])).toEqual([
      ['E047', '/lines/0'],
      ['E047', '/lines/0/words'],
    ]);
    expect(said([{ on: 'hut/closed', say: 'Shut {' }])).toEqual([
      { code: 'E047', path: '/lines/0/say', message: 'This { isn’t closed' },
    ]);
  });

  it('sounds and buzzes a line, its words or none, naming a sound there is (M4.8)', () => {
    expect(
      said([
        { on: 'hut/closed', sound: 'door', buzz: 'thud' },
        { on: 'hut/visited', say: 'Someone at the door.', sound: 'door', to: 'toast' },
        { on: 'inventory/gained', buzz: 'tap' },
      ]),
    ).toEqual([]);
    expect(said([{ on: 'hut/closed', sound: 'gong' }])).toEqual([
      { code: 'E049', path: '/lines/0/sound', message: 'There’s no sound record "gong"' },
    ]);
    expect(said([{ on: 'hut/closed', buzz: 'rumble' }]).map((d) => [d.code, d.path])).toEqual([
      ['E047', '/lines/0/buzz'],
    ]);
    expect(said([{ on: 'hut/closed', sound: 'door', to: 'log' }])).toEqual([
      {
        code: 'E047',
        path: '/lines/0/to',
        message: 'Only words go to a toast or the log: give this line say, or take out to',
      },
    ]);
  });

  it('gives an event the game doesn’t declare as E051', () => {
    expect(said([{ on: 'hut/burned', say: 'Gone' }])).toEqual([
      { code: 'E051', path: '/lines/0/on', message: 'The game declares no event "hut/burned"' },
    ]);
  });

  it('gives an argument the event lacks, or a value it can’t take, as E052', () => {
    expect(said([{ on: 'hut/visited', where: { whom: 'greta' }, say: 'Hi' }])).toEqual([
      { code: 'E052', path: '/lines/0/where/whom', message: '"hut/visited" has no argument "whom": it has who' },
    ]);
    expect(said([{ on: 'hut/visited', where: { who: 'hans' }, say: 'Hi' }])).toEqual([
      { code: 'E052', path: '/lines/0/where/who', message: 'Expected one of: greta, anselm' },
    ]);
    expect(said([{ on: 'inventory/gained', where: { item: 'axe' }, say: 'Axe' }])).toEqual([
      expect.objectContaining({ code: 'E052', path: '/lines/0/where/item', message: expect.stringContaining('axe') }),
    ]);
    expect(said([{ on: 'hut/closed', say: 'Shut by {.who}' }])).toEqual([
      { code: 'E052', path: '/lines/0/say', message: '{.who}: "hut/closed" has no argument "who": it has none' },
    ]);
  });

  it('gives a fact or a view’s field in a line’s words as E048: only the beat’s arguments are read', () => {
    expect(said([{ on: 'hut/closed', say: 'Shut on day {time.day}' }])).toEqual([
      {
        code: 'E048',
        path: '/lines/0/say',
        message: '{time.day}: a feedback line reads only its event’s arguments, as {.item}',
      },
    ]);
    expect(said([{ on: 'hut/closed', say: '{talk.text}' }]).map((d) => d.code)).toEqual(['E048']);
  });

  it('leaves events unchecked until the game has run, but still reads the words', () => {
    const { events: _, ...unknown } = game;
    expect(said([{ on: 'hut/burned', where: { by: 'storm' }, say: 'Gone in the {.storm}' }], unknown)).toEqual([]);
    expect(said([{ on: 'hut/burned', say: 'Day {time.day}' }], unknown).map((d) => d.code)).toEqual(['E048']);
  });

  it('skips a feedback file that didn’t read: its E007 is the reader’s', () => {
    const unread = { file: 'ui/feedback.json', value: undefined, unreadable: true };
    expect(checkUi(files({ hud }), undefined, game, unread)).toEqual([]);
  });
});

describe('the log widget', () => {
  const only = (main: unknown) =>
    checkUi(files({ hud: { ...hud, main } }), undefined, game).map(({ code, path }) => [code, path]);

  it('takes lines from 1 to 100, a label and words for when it is empty', () => {
    expect(only({ widget: 'log' })).toEqual([]);
    expect(only({ widget: 'log', lines: 3, label: 'Lately', empty: 'Nothing yet, day {time.day}' })).toEqual([]);
    expect(only({ widget: 'log', lines: 0 })).toEqual([['E047', '/main/lines']]);
    expect(only({ widget: 'log', lines: 101 })).toEqual([['E047', '/main/lines']]);
    expect(only({ widget: 'log', lines: 2.5 })).toEqual([['E047', '/main/lines']]);
  });

  it('checks its label and empty words as any template', () => {
    expect(only({ widget: 'log', label: '{.name}', empty: '{time.year}' })).toEqual([
      ['E048', '/main/empty'],
      ['E048', '/main/label'],
    ]);
  });
});

describe('W134', () => {
  const close = { widget: 'button', label: 'Close', action: { close: true } };
  const w134 = (screens: Record<string, unknown>) =>
    checkUi(files({ hud, ...screens }), undefined, game)
      .filter((d) => d.code === 'W134')
      .map((d) => d.file);

  it('warns of a screen only a button opens with no button that closes it', () => {
    expect(w134({ map: { main: { widget: 'text', text: 'Map' } } })).toEqual(['ui/map.json']);
    expect(w134({ map: { shows: [], main: { widget: 'text', text: 'Map' } } })).toEqual(['ui/map.json']);
  });

  it('is quiet once a close button is anywhere on it, however deep', () => {
    expect(w134({ map: { main: { widget: 'text', text: 'Map' }, bottom: close } })).toEqual([]);
    const deep = { widget: 'tabs', tabs: [{ label: 'A', children: [{ widget: 'panel', children: [close] }] }] };
    expect(w134({ map: { main: deep } })).toEqual([]);
    // A list's item counts too: its button closes the screen whichever entry it is in.
    expect(w134({ map: { main: { widget: 'list', of: 'bag', item: close } } })).toEqual([]);
  });

  it('is quiet for a screen a mode shows: the mode changing takes it away', () => {
    expect(w134({ talk: { shows: ['hut'], main: { widget: 'text', text: 'Hi' } } })).toEqual([]);
  });
});
