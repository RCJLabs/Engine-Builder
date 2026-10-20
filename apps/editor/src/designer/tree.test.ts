/**
 * The designer's outline and its edits (M4.5, D55): rows of the hut's own screens, each edit as a
 * plain function of the screen's JSON, and the one key order a written widget follows, which the
 * hut's files, written by hand, already keep.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changesGame } from '../projects/opened.ts';
import { keysAt, pathOf, pointer, pruneAt, setAt, valueAt } from './paths.ts';
import { type Row, rowName, rowsOf } from './tree.ts';
import { addPlace, addTab, addWidget, duplicate, moveBy, moveIn, moveOut, moveTo, remove, wrap } from './treeEdits.ts';
import { newWidget, WIDGETS, widgetKeys, withMode } from './widgets.ts';

const HUT = resolve(import.meta.dirname, '../../../../tools/cli/test/fixtures/hut/ui');
const screen = (id: string) => JSON.parse(readFileSync(`${HUT}/${id}.json`, 'utf8')) as Record<string, unknown>;
const rowAt = (value: unknown, at: string): Row => {
  const row = rowsOf(value).find((r) => r.at === at);
  if (!row) throw new Error(`No row at ${at}`);
  return row;
};
const kinds = (value: unknown, at: string) =>
  ((valueAt(value, at) as unknown[]) ?? []).map((w) => (w as { widget: string }).widget);

describe('the outline', () => {
  it('lists the screen, its slots, its widgets and its tabs, top to bottom, each where it sits', () => {
    const rows = rowsOf(screen('journal'));
    expect(rows.map((r) => [r.at, r.depth, rowName(r)])).toEqual([
      ['', 0, 'Screen'],
      ['/top', 1, 'Top: empty'],
      ['/main', 1, 'Main: Tabs'],
      ['/main/tabs/0', 2, 'Tab Quests'],
      ['/main/tabs/0/children/0', 3, 'List'],
      ['/main/tabs/0/children/0/item', 4, 'Item: Panel'],
      ['/main/tabs/0/children/0/item/children/0', 5, 'Text'],
      ['/main/tabs/0/children/0/item/children/1', 5, 'Text'],
      ['/main/tabs/0/children/0/item/children/2', 5, 'Text'],
      ['/main/tabs/1', 2, 'Tab Bag'],
      ['/main/tabs/1/children/0', 3, 'List'],
      ['/main/tabs/1/children/0/item', 4, 'Item: Text'],
      ['/main/tabs/2', 2, 'Tab Log'],
      ['/main/tabs/2/children/0', 3, 'Log'],
      ['/bottom', 1, 'Bottom: Stack'],
      ['/bottom/children/0', 2, 'Button'],
    ]);
    expect(rows.find((r) => r.at === '/main/tabs/1')?.among).toEqual({ list: '/main/tabs', index: 1, count: 3 });
    expect(rows.find((r) => r.at === '/bottom')?.among).toBeUndefined();
  });

  it('says what each widget is in a few words, and gives a records list its Unknown slot', () => {
    const codex = {
      main: {
        widget: 'list',
        of: 'records',
        type: 'item',
        item: { widget: 'text', text: '{.name}' },
      },
    };
    const rows = rowsOf(codex);
    expect(rows.map((r) => `${rowName(r)} · ${r.summary}`)).toEqual([
      'Screen · ',
      'Top: empty · Empty',
      'Main: List · records of item',
      'Item: Text · {.name}',
      'Unknown: empty · Empty',
      'Bottom: empty · Empty',
    ]);
    expect(rowsOf({ main: { widget: 'sparkle' } }).map(rowName)).toContain('Main: Unknown widget sparkle');
  });
});

describe('the outline’s edits', () => {
  const hut = screen('hut');
  it('adds into an empty slot, inside a container at its end, or after a widget among others', () => {
    const top = addWidget({ main: hut.main }, rowAt({ main: hut.main }, '/top'), 'text');
    expect(top).toEqual({ screen: { top: newWidget('text'), main: hut.main }, selected: '/top' });
    const inside = addWidget(hut, rowAt(hut, '/main'), 'log');
    expect(inside?.selected).toBe('/main/children/4');
    expect(kinds(inside?.screen, '/main/children')).toEqual(['progress', 'panel', 'grid', 'log', 'log']);
    const after = addWidget(hut, rowAt(hut, '/main/children/0'), 'text');
    expect(after?.selected).toBe('/main/children/1');
    expect(kinds(after?.screen, '/main/children')).toEqual(['progress', 'text', 'panel', 'grid', 'log']);
    // A tab takes widgets inside it; a widget alone in its slot has nowhere to put one beside it.
    expect(addPlace(screen('journal'), rowAt(screen('journal'), '/main/tabs/2'))).toEqual({
      kind: 'list',
      list: '/main/tabs/2/children',
      index: 1,
    });
    expect(addPlace(screen('journal'), rowAt(screen('journal'), '/main'))).toBeNull();
    expect(addPlace(hut, rowAt(hut, ''))).toBeNull();
  });

  it('moves among siblings, into the container before, and out after its container', () => {
    const grid = '/main/children/2/children';
    const down = moveBy(hut, rowAt(hut, `${grid}/0`), 1);
    expect(down?.selected).toBe(`${grid}/1`);
    expect((valueAt(down?.screen, `${grid}/1`) as { label: string }).label).toBe('Carry a load up');
    expect(moveBy(hut, rowAt(hut, `${grid}/0`), -1)).toBeNull();
    expect(moveTo(hut, rowAt(hut, `${grid}/0`), 5)?.selected).toBe(`${grid}/5`);
    // The log goes into the grid before it, at its end, then out again to just after it.
    const into = moveIn(hut, rowAt(hut, '/main/children/3'));
    expect(into?.selected).toBe(`${grid}/6`);
    expect(kinds(into?.screen, '/main/children')).toEqual(['progress', 'panel', 'grid']);
    const out = into && moveOut(into.screen, rowAt(into.screen, `${grid}/6`));
    expect(out?.selected).toBe('/main/children/3');
    expect(out?.screen).toEqual(hut);
    // In needs a container before it; Out needs a container that sits among others.
    expect(moveIn(hut, rowAt(hut, '/main/children/1'))).toBeNull();
    expect(moveOut(hut, rowAt(hut, '/main/children/0'))).toBeNull();
    const journal = screen('journal');
    expect(moveOut(journal, rowAt(journal, '/main/tabs/2/children/0'))).toBeNull();
  });

  it('duplicates beside, wraps in a stack, deletes, and adds tabs', () => {
    const twice = duplicate(hut, rowAt(hut, '/main/children/3'));
    expect(kinds(twice?.screen, '/main/children')).toEqual(['progress', 'panel', 'grid', 'log', 'log']);
    expect(twice?.selected).toBe('/main/children/4');
    const bottom = screen('hut').bottom;
    const wrapped = wrap(hut, rowAt(hut, '/bottom'));
    expect(valueAt(wrapped?.screen, '/bottom')).toEqual({ widget: 'stack', children: [bottom] });
    // A slot's widget leaves the slot empty; the last of a list selects its container.
    expect(remove(hut, rowAt(hut, '/top'))).toEqual({ screen: withoutTop(hut), selected: '/top' });
    expect(remove(hut, rowAt(hut, '/main/children/3'))?.selected).toBe('/main/children/2');
    const one = { main: { widget: 'stack', children: [{ widget: 'log' }] } };
    expect(remove(one, rowAt(one, '/main/children/0'))).toEqual({
      screen: { main: { widget: 'stack', children: [] } },
      selected: '/main',
    });
    const journal = screen('journal');
    expect(remove(journal, rowAt(journal, '/main/tabs/1/children/0'))?.selected).toBe('/main/tabs/1');
    const tabs = addTab(journal, rowAt(journal, '/main/tabs/0'));
    expect(tabs?.selected).toBe('/main/tabs/3');
    expect(valueAt(tabs?.screen, '/main/tabs/3')).toEqual({ label: 'Tab 4', children: [] });
    expect(addTab(hut, rowAt(hut, '/main'))).toBeNull();
    expect(remove(hut, rowAt(hut, ''))).toBeNull();
  });
});

describe('the screen’s modes', () => {
  it('ticks a mode on at the end and off again, and none left is no `shows` at all', () => {
    expect(withMode([], 'hut', true)).toEqual(['hut']);
    expect(withMode(['hut'], 'talking', true)).toEqual(['hut', 'talking']);
    expect(withMode(['hut', 'talking'], 'hut', true)).toEqual(['talking', 'hut']);
    expect(withMode(['hut', 'talking'], 'hut', false)).toEqual(['talking']);
    expect(withMode(['hut'], 'hut', false)).toBeUndefined();
  });
});

describe('what recompiles the designer’s game', () => {
  it('is any change outside ui/, or one that names no files; a screen’s edit alone is not', () => {
    expect(changesGame(['ui/hut.json'])).toBe(false);
    expect(changesGame(['ui/hut.json', 'ui/theme.json'])).toBe(false);
    expect(changesGame(['ui/hut.json', 'scripts/hut.ts'])).toBe(true);
    expect(changesGame(['items/rope.json'])).toBe(true);
    expect(changesGame(undefined)).toBe(true);
  });
});

function withoutTop(value: Record<string, unknown>) {
  const { top: _, ...rest } = value;
  return rest;
}

describe('where things sit in a screen file', () => {
  it('reads a pointer as a path, an index only where it steps into a list', () => {
    const value = { args: { '0': 'zero', 'a/b': 1 }, list: [{ x: 1 }] };
    expect(pathOf(value, '/list/0/x')).toEqual(['list', 0, 'x']);
    expect(pathOf(value, '/args/0')).toEqual(['args', '0']);
    expect(pathOf(value, '/args/a~1b')).toEqual(['args', 'a/b']);
    expect(pointer(['args', 'a/b', 0])).toBe('/args/a~1b/0');
    expect(pathOf(value, '')).toEqual([]);
  });

  it('puts a new key where the file’s order says, for a widget, an action, an `at` and the screen', () => {
    const grid = { widget: 'grid', columns: 1, children: [] };
    expect(Object.keys(valueAt(setAt({ main: grid }, ['main', 'gap'], 1), '/main') as object)).toEqual([
      'widget',
      'columns',
      'gap',
      'children',
    ]);
    const placed = setAt({ main: grid }, ['main', 'at', 'desktop', 'columns'], 3);
    const twice = setAt(placed, ['main', 'at', 'landscape', 'columns'], 2);
    expect(Object.keys(valueAt(twice, '/main') as object)).toEqual(['widget', 'columns', 'at', 'children']);
    expect(Object.keys(valueAt(twice, '/main/at') as object)).toEqual(['landscape', 'desktop']);
    expect(Object.keys(setAt({ main: grid, title: 'T' }, ['shows'], ['hut']) as object)).toEqual([
      'main',
      'title',
      'shows',
    ]);
    expect(keysAt({}, [])).toContain('modal');
    const button = { main: { widget: 'button', label: 'Visit', action: { args: {} } } };
    const action = valueAt(setAt(button, ['main', 'action', 'take'], 'hut/visit'), '/main/action');
    expect(Object.keys(action as object)).toEqual(['take', 'args']);
    const styled = valueAt(setAt(button, ['main', 'style'], 'primary'), '/main');
    expect(Object.keys(styled as object)).toEqual(['widget', 'label', 'style', 'action']);
  });

  it('drops an `at` left with nothing in it, breakpoint by breakpoint', () => {
    const value = { main: { widget: 'grid', columns: 1, at: { tablet: {}, desktop: { columns: 3 } } } };
    expect(pruneAt(value, ['main'])).toEqual({ main: { widget: 'grid', columns: 1, at: { desktop: { columns: 3 } } } });
    const none = { main: { widget: 'grid', columns: 1, at: { tablet: {} } } };
    expect(pruneAt(none, ['main'])).toEqual({ main: { widget: 'grid', columns: 1 } });
  });

  it('writes every widget of the hut’s screens in the order its file keeps, as written by hand', () => {
    const order = (widget: Record<string, unknown>) => {
      const known = widgetKeys(widget.widget as string);
      const keys = Object.keys(widget);
      return keys.filter((key) => known.includes(key)).length === keys.length &&
        keys.every((key, i) => i === 0 || known.indexOf(key) > known.indexOf(keys[i - 1] as string))
        ? 'in order'
        : keys.join(',');
    };
    for (const id of ['hut', 'journal', 'talk', 'storm', 'store', 'closed']) {
      for (const row of rowsOf(screen(id)).filter((r) => r.role === 'widget')) {
        expect(order(valueAt(screen(id), row.at) as Record<string, unknown>), `${id} ${row.at}`).toBe('in order');
      }
    }
    for (const kind of WIDGETS) expect(order(newWidget(kind)), kind).toBe('in order');
  });
});
