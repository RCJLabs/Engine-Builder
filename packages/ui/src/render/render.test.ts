import { describe, expect, it } from 'vitest';
import { type ListWidget, listTakes, type Screen, type Widget } from '../format/screen.ts';
import { DEFAULT_THEME } from '../format/theme.ts';
import type { Entry, View } from '../session/types.ts';
import { tabHolding } from './context.ts';
import { actionFor, amount, fill, fillSome, holds, shownText } from './fill.ts';
import { breakpointOf, layoutAt, layoutStyle, themeVars } from './layout.ts';
import { drawn, screenFor, screenStack, stillOpen } from './stack.ts';

const text = (t: string): Widget => ({ widget: 'text', text: t });
const screens: Record<string, Screen> = {
  hud: { shows: ['hut'], main: text('Hut') },
  'hud-old': { shows: ['hut'], main: text('Old') },
  talk: { shows: ['talking'], modal: true, main: text('Talk') },
  store: { shows: ['shopping'], modal: true, main: text('Store') },
  journal: { modal: true, main: text('Journal') },
  map: { main: text('Map') },
};
const ids = (stack: ReturnType<typeof screenStack>) => stack.map((s) => (s.kind === 'screen' ? s.id : `(${s.mode})`));

describe('the stack', () => {
  it('takes, for each mode, the first screen in id order that shows it', () => {
    expect(screenFor(screens, 'hut')).toBe('hud');
    expect(screenFor(screens, 'sea')).toBeUndefined();
  });

  it('stacks the modes’ screens bottom to top, the fallback for a mode none shows, then those opened', () => {
    expect(ids(screenStack(screens, ['hut', 'talking'], []))).toEqual(['hud', 'talk']);
    expect(ids(screenStack(screens, ['hut', 'sea'], ['journal']))).toEqual(['hud', '(sea)', 'journal']);
    // A mode twice in a row shows once; a screen opened that isn't there shows nothing.
    expect(ids(screenStack(screens, ['hut', 'hut'], ['nowhere']))).toEqual(['hud']);
  });

  it('draws the top and, under modal screens, down to the first that isn’t', () => {
    const at = (modes: string[], opened: string[] = []) => ids(drawn(screenStack(screens, modes, opened)) as never);
    expect(at(['hut', 'talking', 'shopping'])).toEqual(['hud', 'talk', 'store']);
    expect(at(['hut', 'talking'], ['map'])).toEqual(['map']);
    expect(at(['hut'], ['map', 'journal'])).toEqual(['map', 'journal']);
    expect(at(['sea', 'talking'])).toEqual(['(sea)', 'talk']);
    expect(at([])).toEqual([]);
  });

  it('keeps the screens a button opened only while the modes are the ones they were opened in', () => {
    const opened = { modes: ['hut'], ids: ['journal'] };
    expect(stillOpen(opened, ['hut'])).toEqual(['journal']);
    expect(stillOpen(opened, ['hut', 'talking'])).toEqual([]);
    expect(stillOpen(opened, ['closed'])).toEqual([]);
    expect(stillOpen({ modes: ['hut', 'talking'], ids: ['map'] }, ['hut', 'shopping'])).toEqual([]);
  });
});

describe('a frame being designed (M4.5)', () => {
  it('shows the tab the selection is in, and none of its own choosing otherwise', () => {
    expect(tabHolding('/main', '/main/tabs/2/children/0')).toBe(2);
    expect(tabHolding('/main', '/main/tabs/1')).toBe(1);
    expect(tabHolding('/main', '/main/tabs/12/children/3/item')).toBe(12);
    expect(tabHolding('/main', '/main')).toBeUndefined();
    expect(tabHolding('/main', '/mainly/tabs/1')).toBeUndefined();
    expect(tabHolding('/main/children/0', '/main/tabs/1')).toBeUndefined();
    expect(tabHolding('/main', undefined)).toBeUndefined();
  });
});

const view: View = {
  modes: ['hut'],
  offered: [{ type: 'hut/rest' }, { type: 'hut/visit', who: 'greta' }, { type: 'hut/visit', who: 'anselm' }],
  facts: { 'time.day': 3, 'hut.open': true, 'hut.none': null },
  conditions: { 'time.day > 2': true, 'time.day > 5': false, 'nope.x': null },
  fields: { 'talk.text': 'Tea?' },
  lists: {},
  turn: 4,
  ended: false,
};
const entry: Entry = {
  key: 'rope',
  fields: { name: 'Rope', price: 12 },
  action: { type: 'economy/buy', item: 'rope' },
  enabled: true,
};

describe('an offered list’s takes (M4.12)', () => {
  it('lists only the action types it names, or a module’s by module/*, and every one without takes', () => {
    const rest = { type: 'hut/rest' };
    const visit = { type: 'hut/visit', who: 'greta' };
    const buy = { type: 'economy/buy', item: 'rope' };
    const takes = (list: Partial<ListWidget>) =>
      [rest, visit, buy, undefined].map((action) => listTakes({ of: 'offered', ...list }, action));
    expect(takes({})).toEqual([true, true, true, true]);
    expect(takes({ takes: ['hut/visit'] })).toEqual([false, true, false, false]);
    expect(takes({ takes: ['hut/*'] })).toEqual([true, true, false, false]);
    expect(takes({ takes: ['hut/*', 'economy/buy'] })).toEqual([true, true, true, false]);
    // `hut/*` is the hut module's, not a module whose name starts with hut.
    expect(listTakes({ of: 'offered', takes: ['hut/*'] }, { type: 'hutch/rest' })).toBe(false);
    // Only an offered list is narrowed.
    expect(listTakes({ of: 'bag', takes: ['hut/visit'] }, buy)).toBe(true);
  });
});

describe('filling templates', () => {
  it('fills facts, views’ fields and entries’ fields, with a dash for no value', () => {
    expect(fill('Day {time.day}: {talk.text}', view)).toBe('Day 3: Tea?');
    expect(fill('{.name} for {.price}', view, entry)).toBe('Rope for 12');
    expect(fill('{hut.none} {hut.unknown} {.name}', view)).toBe('— — —');
    expect(fill('Open: {hut.open}', view)).toBe('Open: yes');
    expect(fill('Broken {time.day', view)).toBe('Broken {time.day');
    expect(shownText(false)).toBe('no');
  });

  it('leaves a button’s second line out while every binding in it is empty, and fills it otherwise (M4.7)', () => {
    const odds: Entry = { ...entry, fields: { odds: 'Win 64% · Lose 36%', none: null, blank: '' } };
    expect(fillSome('{.odds}', view, odds)).toBe('Win 64% · Lose 36%');
    expect(fillSome('{.none}', view, odds)).toBeUndefined();
    expect(fillSome('{.blank} {.missing}', view, odds)).toBeUndefined();
    expect(fillSome('Odds: {.none}', view, odds)).toBeUndefined();
    // One binding with a value is enough to draw it, dashes for the rest; no bindings, as written.
    expect(fillSome('{.odds} ({.none})', view, odds)).toBe('Win 64% · Lose 36% (—)');
    expect(fillSome('Day {time.day}', view)).toBe('Day 3');
    expect(fillSome('Always', view)).toBe('Always');
  });

  it('reads a number field as written or from its binding', () => {
    expect(amount(5, view)).toBe(5);
    expect(amount('{time.day}', view)).toBe(3);
    expect(amount('{hut.none}', view)).toBeNull();
    expect(amount('{.price}', view, entry)).toBe(12);
  });

  it('draws a widget only while its shows-when holds, unknown being not', () => {
    expect(holds(text('a'), view)).toBe(true);
    expect(holds({ ...text('a'), 'shows-when': 'time.day > 2' }, view)).toBe(true);
    expect(holds({ ...text('a'), 'shows-when': 'time.day > 5' }, view)).toBe(false);
    expect(holds({ ...text('a'), 'shows-when': 'nope.x' }, view)).toBe(false);
    expect(holds({ ...text('a'), 'shows-when': 'never.sent' }, view)).toBe(false);
  });

  it('reads a codex entry’s own facts and shows-when for it, the view’s for the rest (M4.4)', () => {
    const rope: Entry = {
      key: 'rope',
      fields: { name: 'Rope' },
      enabled: false,
      facts: { 'inventory.count(item: @entry)': 2, 'time.day': 9 },
      conditions: { 'inventory.count(item: @entry) > 1': true, 'time.day > 5': true },
    };
    expect(fill('{.name} ×{inventory.count(item: @entry)}', view, rope)).toBe('Rope ×2');
    // Its own come first, even where the view has the same text; without it, the view's.
    expect(fill('{time.day}', view, rope)).toBe('9');
    expect(fill('{inventory.count(item: @entry)}', view)).toBe('—');
    expect(holds({ ...text('a'), 'shows-when': 'inventory.count(item: @entry) > 1' }, view, rope)).toBe(true);
    expect(holds({ ...text('a'), 'shows-when': 'inventory.count(item: @entry) > 1' }, view)).toBe(false);
    expect(holds({ ...text('a'), 'shows-when': 'time.day > 5' }, view, rope)).toBe(true);
    expect(holds({ ...text('a'), 'shows-when': 'time.day > 2' }, view, rope)).toBe(true);
  });
});

describe('what a button takes', () => {
  it('takes an action on offer, matching the arguments it gives, or the first of its type', () => {
    expect(actionFor({ take: 'hut/rest' }, view)).toEqual({ type: 'hut/rest' });
    expect(actionFor({ take: 'hut/visit', args: { who: 'anselm' } }, view)).toEqual({
      type: 'hut/visit',
      who: 'anselm',
    });
    expect(actionFor({ take: 'hut/visit' }, view)).toEqual({ type: 'hut/visit', who: 'greta' });
  });

  it('takes nothing, so is disabled, while no such action is on offer', () => {
    expect(actionFor({ take: 'hut/carry' }, view)).toBeUndefined();
    expect(actionFor({ take: 'hut/visit', args: { who: 'nobody' } }, view)).toBeUndefined();
    // An argument no such action has, as one being typed in the designer is (M4.5): none, not a throw.
    expect(actionFor({ take: 'hut/visit', args: { arg1: '' } }, view)).toBeUndefined();
    expect(actionFor({ open: 'map' }, view)).toBeUndefined();
    expect(actionFor({ shell: 'title' }, view)).toBeUndefined();
  });

  it('takes nothing while a step is on its way, so a second press can’t act on the old view', () => {
    expect(actionFor({ take: 'hut/rest' }, view, undefined, true)).toBeUndefined();
    expect(actionFor({ take: 'entry' }, view, entry, true)).toBeUndefined();
    expect(actionFor({ take: 'hut/rest' }, view, undefined, false)).toEqual({ type: 'hut/rest' });
  });

  it('takes an entry’s action only while the entry is enabled', () => {
    expect(actionFor({ take: 'entry' }, view, entry)).toEqual({ type: 'economy/buy', item: 'rope' });
    expect(actionFor({ take: 'entry' }, view, { ...entry, enabled: false })).toBeUndefined();
    expect(actionFor({ take: 'entry' }, view)).toBeUndefined();
  });
});

describe('layout', () => {
  it('names the breakpoint from the game’s box', () => {
    expect(breakpointOf(360, 740)).toBe('phone');
    expect(breakpointOf(390, 844)).toBe('phone');
    expect(breakpointOf(844, 390)).toBe('landscape');
    expect(breakpointOf(768, 1024)).toBe('tablet');
    expect(breakpointOf(1280, 800)).toBe('desktop');
    // Short but not wide is still a phone's portrait.
    expect(breakpointOf(300, 400)).toBe('phone');
  });

  it('lays a widget’s `at` for the breakpoint over its own layout', () => {
    const row: Widget = { widget: 'stack', children: [], gap: 2, at: { landscape: { direction: 'row', wrap: true } } };
    expect(layoutAt(row, 'phone')).toEqual({ gap: 2 });
    expect(layoutAt(row, 'landscape')).toEqual({ gap: 2, direction: 'row', wrap: true });
    // A field the widget has itself gives way to its `at`.
    const column: Widget = { widget: 'stack', children: [], direction: 'column', at: { tablet: { direction: 'row' } } };
    expect(layoutAt(column, 'phone').direction).toBe('column');
    expect(layoutAt(column, 'tablet').direction).toBe('row');
    expect(layoutStyle(row, 'landscape')).toEqual({
      gap: 'calc(var(--eb-space) * 2)',
      'flex-direction': 'row',
      'flex-wrap': 'wrap',
    });
    expect(layoutStyle({ widget: 'grid', children: [], columns: 3 }, 'phone')).toEqual({
      gap: 'calc(var(--eb-space) * 1)',
      'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
    });
    expect(
      layoutStyle({ widget: 'stack', children: [], justify: 'between', align: 'center' }, 'desktop'),
    ).toMatchObject({
      'justify-content': 'space-between',
      'align-items': 'center',
    });
  });

  it('turns the theme into the variables the stylesheet reads', () => {
    expect(themeVars()).toMatchObject({
      '--eb-background': '#14161a',
      '--eb-on-accent': '#0b1220',
      '--eb-space': '8px',
    });
    expect(themeVars({ colors: DEFAULT_THEME.colors, size: 18 })['--eb-size']).toBe('18px');
  });
});
