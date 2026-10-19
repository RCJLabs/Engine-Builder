import type { RecordIndex } from '@eb/core';
import { DEFAULT_THEME } from '@eb/ui/format';
import { describe, expect, it } from 'vitest';
import { knownFrom } from './known.ts';
import { checkUi, type UiCheckOptions, type UiFile } from './uiCheck.ts';

const KITS = ['inventory', 'economy', 'dialogue', 'time'];
const records: RecordIndex = {
  ids: (type) => (type === 'resource' ? ['coins'] : []),
  has: (type, id) => type === 'resource' && id === 'coins',
};
// A game that has run: its facts are all there are, and its actions and modes are known.
const game: UiCheckOptions = {
  facts: knownFrom({ kits: KITS, facts: knownFrom({}).facts }).facts,
  openFacts: false,
  kits: KITS,
  actions: ['hut/rest', 'hut/carry', 'economy/buy', 'dialogue/say'],
  modes: ['hut', 'talking', 'shopping'],
  records,
  assets: new Set(['hut.png']),
};

const screen = (main: unknown, more: object = {}) => ({ shows: ['hut'], main, ...more });
const files = (screens: Record<string, unknown>): Map<string, UiFile> =>
  new Map(Object.entries(screens).map(([id, value]) => [id, { file: `ui/${id}.json`, value }]));
const check = (screens: Record<string, unknown>, options: Partial<UiCheckOptions> = {}, theme?: unknown) =>
  checkUi(files(screens), theme === undefined ? undefined : { file: 'ui/theme.json', value: theme }, {
    ...game,
    ...options,
  }).map(({ code, file, path, message }) => ({ code, file, path, message }));
// Each mode shown, so W133 stays out of the way of the checks that aren't about it.
const shown = {
  talk: { shows: ['talking'], main: { widget: 'text', text: '' } },
  store: { shows: ['shopping'], main: { widget: 'text', text: '' } },
};
const only = (main: unknown, options: Partial<UiCheckOptions> = {}) => check({ hud: screen(main), ...shown }, options);

describe('checkUi', () => {
  it('passes a sound screen that reads facts, views and entries and takes what the game offers', () => {
    const main = {
      widget: 'stack',
      children: [
        { widget: 'text', text: 'Day {time.day}, {economy.amount(resource: coins)} coins', style: 'title' },
        { widget: 'progress', value: '{economy.amount(resource: coins)}', max: 20, label: 'Coins' },
        { widget: 'button', label: 'Rest', action: { take: 'hut/rest' }, 'shows-when': 'time.day < 10' },
        { widget: 'button', label: 'Talk', action: { open: 'talk' } },
        { widget: 'image', asset: 'hut.png', alt: 'The hut' },
        { widget: 'text', text: '{talk.speaker}: {talk.text}' },
        {
          widget: 'list',
          of: 'talk',
          empty: 'Nothing to say',
          item: { widget: 'button', label: '{.label} {.odds}', action: { take: 'entry' } },
        },
        {
          widget: 'tabs',
          tabs: [
            {
              label: 'Bag',
              children: [{ widget: 'list', of: 'bag', item: { widget: 'text', text: '{.name} ×{.count}' } }],
            },
          ],
        },
        { widget: 'button', label: 'Close', action: { close: true } },
      ],
    };
    expect(only(main)).toEqual([]);
  });

  it('gives each shape problem as E047 at its path', () => {
    expect(only({ widget: 'stack', children: [{ widget: 'text', txt: 'Hi' }, { widget: 'dial' }] })).toEqual([
      { code: 'E047', file: 'ui/hud.json', path: '/main/children/0/text', message: 'Missing field "text"' },
      { code: 'E047', file: 'ui/hud.json', path: '/main/children/0/txt', message: 'Unknown field "txt"' },
      expect.objectContaining({ code: 'E047', path: '/main/children/1/widget' }),
    ]);
    expect(check({ hud: { shows: ['hut'] }, ...shown })).toEqual([
      { code: 'E047', file: 'ui/hud.json', path: '/main', message: 'Missing field "main"' },
    ]);
  });

  it('gives a template whose braces go wrong as E047, at the field', () => {
    expect(only({ widget: 'text', text: 'Day {time.day' })).toEqual([
      { code: 'E047', file: 'ui/hud.json', path: '/main/text', message: 'This { isn’t closed' },
    ]);
    expect(only({ widget: 'tabs', tabs: [{ label: 'A}', children: [] }] })).toEqual([
      { code: 'E047', file: 'ui/hud.json', path: '/main/tabs/0/label', message: 'This } closes nothing' },
    ]);
  });

  it('gives a fact the game lacks, or wrong arguments, or a comparison in braces as E048', () => {
    const main = {
      widget: 'stack',
      children: [
        { widget: 'text', text: '{hold.count}' },
        { widget: 'text', text: '{economy.amount}' },
        { widget: 'text', text: '{economy.amount(resource: gold)}' },
        { widget: 'text', text: '{time.day > 3}' },
        { widget: 'progress', value: 1, max: '{time.dya}', label: 'Days' },
        { widget: 'text', text: '{time day}' },
      ],
    };
    expect(only(main)).toEqual([
      {
        code: 'E048',
        file: 'ui/hud.json',
        path: '/main/children/0/text',
        message: '{hold.count}: No fact "hold.count"',
      },
      {
        code: 'E048',
        file: 'ui/hud.json',
        path: '/main/children/1/text',
        message: '{economy.amount}: "economy.amount" needs the argument "resource"',
      },
      expect.objectContaining({ code: 'E048', path: '/main/children/2/text' }),
      {
        code: 'E048',
        file: 'ui/hud.json',
        path: '/main/children/3/text',
        message: '{time.day > 3} shows one fact’s value: a comparison goes in shows-when',
      },
      { code: 'E048', file: 'ui/hud.json', path: '/main/children/4/max', message: '{time.dya}: No fact "time.dya"' },
      expect.objectContaining({ code: 'E048', path: '/main/children/5/text' }),
    ]);
  });

  it('takes a fact as written when no game’s facts were given, as records’ conditions do', () => {
    expect(only({ widget: 'text', text: '{hold.count}' }, { openFacts: true })).toEqual([]);
  });

  it('checks shows-when as a condition: E048 when it doesn’t read or names what the game lacks', () => {
    const main = {
      widget: 'stack',
      children: [
        { widget: 'text', text: 'A', 'shows-when': 'time.day >' },
        { widget: 'text', text: 'B', 'shows-when': 'hold.count > 1' },
        { widget: 'text', text: 'C', 'shows-when': 'time.day' },
      ],
    };
    expect(only(main)).toEqual([
      expect.objectContaining({ code: 'E048', path: '/main/children/0/shows-when' }),
      { code: 'E048', file: 'ui/hud.json', path: '/main/children/1/shows-when', message: 'No fact "hold.count"' },
      // Unlike a binding, a shows-when must be yes or no.
      expect.objectContaining({ code: 'E048', path: '/main/children/2/shows-when' }),
    ]);
  });

  it('gives an entry’s field outside a list, or one its source lacks, as E048', () => {
    const main = {
      widget: 'stack',
      children: [
        { widget: 'text', text: '{.label}' },
        { widget: 'list', of: 'shelf', item: { widget: 'text', text: '{.label}' } },
      ],
    };
    expect(only(main)).toEqual([
      {
        code: 'E048',
        file: 'ui/hud.json',
        path: '/main/children/0/text',
        message: '{.label} is an entry’s field: only a list’s item has one',
      },
      {
        code: 'E048',
        file: 'ui/hud.json',
        path: '/main/children/1/item/text',
        message: 'A shelf entry has no field "label": item, name, price, count',
      },
    ]);
  });

  it('gives an action, a screen or a source the game lacks as E049', () => {
    const main = {
      widget: 'stack',
      children: [
        { widget: 'button', label: 'Sail', action: { take: 'hut/sail' } },
        { widget: 'button', label: 'Map', action: { open: 'map' } },
        { widget: 'button', label: 'Go', action: { take: 'entry' } },
        { widget: 'list', of: 'journal', item: { widget: 'button', label: 'x', action: { take: 'entry' } } },
        {
          widget: 'list',
          of: 'talk',
          item: { widget: 'button', label: 'x', action: { take: 'entry', args: { a: 1 } } },
        },
        { widget: 'list', of: 'event', item: { widget: 'text', text: '{event.text}' } },
      ],
    };
    const at = (path: string, message: string) => ({ code: 'E049', file: 'ui/hud.json', path, message });
    expect(only(main)).toEqual([
      at('/main/children/0/action/take', 'The game has no action "hut/sail"'),
      at('/main/children/1/action/open', 'No screen "map" in ui/'),
      at('/main/children/2/action/take', 'Only a list’s item takes its entry’s action'),
      at('/main/children/3/item/action/take', 'A journal’s entries come with no action'),
      at('/main/children/3/of', 'A list of journal needs the quests kit: turn it on in project.json'),
      at('/main/children/4/item/action/args', 'An entry’s action comes with its arguments'),
      at('/main/children/5/item/text', '{event.text} needs the events kit: turn it on in project.json'),
      at('/main/children/5/of', 'A list of event needs the events kit: turn it on in project.json'),
    ]);
  });

  it('asks for the kit each source is the view of: the bag is the inventory kit’s', () => {
    const bag = { widget: 'list', of: 'bag', item: { widget: 'text', text: '{.name}' } };
    expect(only(bag, { kits: ['economy'] })).toEqual([
      {
        code: 'E049',
        file: 'ui/hud.json',
        path: '/main/of',
        message: 'A list of bag needs the inventory kit: turn it on in project.json',
      },
    ]);
    expect(only(bag, { kits: ['inventory'] })).toEqual([]);
  });

  it('leaves actions and modes unchecked until the game has run', () => {
    const main = { widget: 'button', label: 'Sail', action: { take: 'hut/sail' } };
    const { actions: _, modes: __, ...unknown } = game;
    expect(checkUi(files({ hud: screen(main, { shows: ['sea'] }) }), undefined, unknown)).toEqual([]);
  });

  it('gives a mode a screen shows that the game lacks as E049, and one no screen shows as W133', () => {
    // W133 is the game's, not a screen's: no file, so it sorts first.
    expect(check({ hud: screen({ widget: 'text', text: '' }, { shows: ['sea', 'hut'] }) })).toEqual([
      {
        code: 'W133',
        file: undefined,
        path: '',
        message: 'No screen shows the mode "shopping": it plays with the fallback, a list of the actions on offer',
      },
      expect.objectContaining({ code: 'W133', path: '', message: expect.stringContaining('"talking"') }),
      { code: 'E049', file: 'ui/hud.json', path: '/shows/0', message: 'The game has no mode "sea"' },
    ]);
    // No screens at all is the fallback everywhere, as before M4.1: nothing to warn of.
    expect(check({})).toEqual([]);
    // A screen with problems of its own still shows what it names.
    expect(check({ hud: { shows: ['hut', 'talking', 'shopping'] } }).map((d) => d.code)).toEqual(['E047']);
  });

  it('skips a screen that didn’t read, and still lets a button open it', () => {
    const screens = files({ hud: screen({ widget: 'button', label: 'Map', action: { open: 'map' } }), ...shown });
    screens.set('map', { file: 'ui/map.json', value: undefined, unreadable: true });
    expect(checkUi(screens, undefined, game)).toEqual([]);
  });

  it('gives an image of a file assets/ lacks as E018', () => {
    expect(only({ widget: 'image', asset: 'map.png', alt: 'Map' })).toEqual([
      { code: 'E018', file: 'ui/hud.json', path: '/main/asset', message: 'No asset "map.png" in assets/' },
    ]);
  });

  it('checks the theme’s shape (E047) and each pair’s contrast (E050)', () => {
    expect(check({}, {}, DEFAULT_THEME)).toEqual([]);
    expect(check({}, {}, { colors: { ...DEFAULT_THEME.colors, text: 'white' }, size: 40 })).toEqual([
      { code: 'E047', file: 'ui/theme.json', path: '/colors/text', message: 'A colour as #rrggbb' },
      expect.objectContaining({ code: 'E047', path: '/size' }),
    ]);
    const faint = { colors: { ...DEFAULT_THEME.colors, muted: '#5a606a', 'on-accent': '#ffffff' } };
    expect(check({}, {}, faint)).toEqual([
      {
        code: 'E050',
        file: 'ui/theme.json',
        path: '/colors/muted',
        message: 'muted on background is 2.86:1; body text needs 4.5:1',
      },
      expect.objectContaining({ code: 'E050', path: '/colors/muted', message: expect.stringContaining('on surface') }),
      expect.objectContaining({
        code: 'E050',
        path: '/colors/on-accent',
        message: expect.stringContaining('on accent'),
      }),
    ]);
  });

  it('gives the same diagnostics whatever order the screens come in', () => {
    const a = { widget: 'text', text: '{hold.a}' };
    const b = { widget: 'button', label: 'x', action: { open: 'nowhere' } };
    const forward = check({ a: screen(a), b: screen(b) });
    const backward = check({ b: screen(b), a: screen(a) });
    expect(backward).toEqual(forward);
    expect(forward.map((d) => d.file)).toEqual([undefined, undefined, 'ui/a.json', 'ui/b.json']);
  });
});
