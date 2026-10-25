/**
 * What the designer's frame draws (M4.5, D55): samples where the moment has nothing, a half-made
 * file drawn rather than thrown, the devices' breakpoints, the fit, the pick, and each new widget
 * as the checks see it.
 */
import { KITS } from '@eb/kits';
import { checkUi, knownFrom } from '@eb/schema';
import { breakpointOf } from '@eb/ui';
import type { Screen } from '@eb/ui/format';
import type { View } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { drawableScreen, drawableWidget } from './drawable.ts';
import { DEVICES, fitScale, pick, sizeOf } from './frame.ts';
import { SAMPLE_MAP, SAMPLES, sample, sampleEntries, sampleView, withSamples } from './samples.ts';
import { newWidget, WIDGETS } from './widgets.ts';

const SHOP: Screen = {
  main: {
    widget: 'stack',
    children: [
      { widget: 'text', text: '{shop.name}: {economy.amount(resource: coins)} coins' },
      { widget: 'list', of: 'shelf', item: { widget: 'text', text: '{.name} for {.price}, {.extra}' } },
      { widget: 'list', of: 'bag', item: { widget: 'text', text: '{.name}' } },
      { widget: 'text', text: 'Late', 'shows-when': 'time.day >= 10' },
    ],
  },
};

const MOMENT: View = {
  modes: ['hut'],
  offered: [],
  facts: { 'economy.amount(resource: coins)': 30 },
  conditions: { 'time.day >= 10': false },
  fields: {},
  lists: { bag: [] },
  turn: 3,
  ended: false,
};

describe('samples where the moment has nothing', () => {
  it('gives a list that doesn’t apply three entries, each field the source has or its item names by name', () => {
    const entries = sampleEntries({ widget: 'list', of: 'shelf', item: { widget: 'text', text: '{.extra}' } });
    expect(entries).toHaveLength(SAMPLES);
    expect(entries[0]?.fields).toEqual({
      item: '‹item›',
      name: '‹name›',
      price: '‹price›',
      count: '‹count›',
      extra: '‹extra›',
    });
    expect(entries.every((e) => !e.enabled)).toBe(true);
  });

  it('keeps the moment’s own values and lists, an empty bag among them, and fills only what it lacks', () => {
    const view = withSamples(MOMENT, SHOP);
    expect(view.facts).toEqual(MOMENT.facts);
    expect(view.conditions).toEqual(MOMENT.conditions);
    expect(view.lists.bag).toEqual([]);
    expect(view.lists.shelf).toHaveLength(SAMPLES);
    expect(view.fields['shop.name']).toBe(sample('shop.name'));
  });

  it('with no game, names every fact, holds every shows-when, and samples every list', () => {
    const view = sampleView(SHOP);
    expect(view.facts).toEqual({ 'economy.amount(resource: coins)': '‹economy.amount(resource: coins)›' });
    expect(view.conditions).toEqual({ 'time.day >= 10': true });
    expect(view.lists.shelf).toHaveLength(SAMPLES);
    expect(view.lists.bag).toHaveLength(SAMPLES);
  });

  it('reads a codex’s @entry facts by name too, so its items draw', () => {
    const codex: Screen = {
      main: {
        widget: 'list',
        of: 'records',
        type: 'item',
        item: { widget: 'text', text: '{inventory.count(item: @entry)}' },
      },
    };
    const view = sampleView(codex);
    expect(view.facts['inventory.count(item: @entry)']).toBe('‹inventory.count(item: @entry)›');
    expect(view.lists['records:item:']).toHaveLength(SAMPLES);
  });

  it('draws a sample map for a map widget the moment has no map for, and keeps the moment’s own (M4.6)', () => {
    const mapped: Screen = { main: { widget: 'map' } };
    expect(withSamples(MOMENT, mapped).map).toBe(SAMPLE_MAP);
    expect(withSamples(MOMENT, SHOP).map).toBeUndefined();
    const own = { ...SAMPLE_MAP, name: 'The Shoals' };
    expect(withSamples({ ...MOMENT, map: own }, mapped).map).toBe(own);
    expect(SAMPLE_MAP.nodes.flatMap((node) => node.travels).every((travel) => !travel.enabled)).toBe(true);
  });
});

describe('a half-made file, drawn', () => {
  it('draws what it lacks or has wrong as a sample, and leaves out a slot that isn’t there', () => {
    expect(drawableWidget({ widget: 'list', of: 'nowhere' })).toEqual({
      widget: 'list',
      of: 'offered',
      item: { widget: 'text', text: '‹item›' },
    });
    expect(drawableWidget({ widget: 'sparkle' })).toEqual({ widget: 'text', text: '‹a widget›' });
    expect(drawableWidget(7)).toEqual({ widget: 'text', text: '‹a widget›' });
    expect(drawableWidget({ widget: 'button', label: 'Go', action: { shell: 'nowhere' } })).toEqual({
      widget: 'button',
      label: 'Go',
      action: { close: true },
    });
    expect(drawableWidget({ widget: 'text', text: 'x', 'shows-when': 5, at: 'wide' })).toEqual({
      widget: 'text',
      text: 'x',
    });
    expect(drawableScreen({ title: 'T', bottom: { widget: 'log' } })).toEqual({
      title: 'T',
      bottom: { widget: 'log' },
    });
    expect(drawableScreen([])).toBeNull();
  });

  it('keeps every kind’s own fields of the right kind: a codex’s type, known, empty, shows-when and at', () => {
    const codex = {
      widget: 'list',
      of: 'records',
      type: 'item',
      known: 'rope > 0',
      empty: 'Nothing yet.',
      'shows-when': 'time.day >= 1',
      at: { phone: { gap: 1 } },
      item: { widget: 'text', text: '{name}' },
    };
    expect(drawableWidget(codex)).toEqual(codex);
    const grid = {
      widget: 'grid',
      columns: 2,
      gap: 2,
      'shows-when': 'a',
      at: { tablet: { columns: 3 } },
      children: [],
    };
    expect(drawableWidget(grid)).toEqual(grid);
  });
});

describe('the frame', () => {
  it('lays out each device as such a device would: phones and landscape, the tablet, the desktop', () => {
    const at = (id: string, turned: boolean) => {
      const device = DEVICES.find((d) => d.id === id);
      if (!device) throw new Error(id);
      const { width, height } = sizeOf(device, turned);
      return breakpointOf(width, height);
    };
    expect([at('phone-360', false), at('phone-390', false), at('phone-390', true)]).toEqual([
      'phone',
      'phone',
      'landscape',
    ]);
    expect([at('tablet', false), at('tablet', true), at('desktop', false), at('desktop', true)]).toEqual([
      'tablet',
      'desktop',
      'desktop',
      'tablet',
    ]);
  });

  it('fits by one scale, never above the device’s own size', () => {
    expect(fitScale({ width: 195, height: 2000 }, { width: 390, height: 844 })).toBe(0.5);
    expect(fitScale({ width: 2000, height: 422 }, { width: 390, height: 844 })).toBe(0.5);
    expect(fitScale({ width: 2000, height: 2000 }, { width: 390, height: 844 })).toBe(1);
    expect(fitScale({ width: 0, height: 0 }, { width: 390, height: 844 })).toBe(1);
  });

  it('picks the deepest widget whose box holds the tap', () => {
    const boxes = [
      { at: '/main', left: 0, top: 0, right: 100, bottom: 100 },
      { at: '/main/children/0', left: 10, top: 10, right: 50, bottom: 50 },
      { at: '/main/children/0/children/1', left: 20, top: 20, right: 30, bottom: 30 },
    ];
    expect(pick(25, 25, boxes)).toBe('/main/children/0/children/1');
    expect(pick(40, 40, boxes)).toBe('/main/children/0');
    expect(pick(90, 90, boxes)).toBe('/main');
    expect(pick(200, 200, boxes)).toBeUndefined();
  });
});

describe('new widgets', () => {
  const kits = KITS.map((kit) => kit.id);
  const known = knownFrom({ kits });
  const options = { facts: known.facts, openFacts: false, kits, events: known.events };
  it('check clean, but for what they leave to fill in: an image’s file, a button’s action and a space’s space', () => {
    for (const kind of WIDGETS) {
      const screens = new Map([
        ['new', { file: 'ui/new.json', value: { main: { widget: 'stack', children: [newWidget(kind)] } } }],
      ]);
      const problems = checkUi(screens, undefined, options).filter((p) => p.severity === 'error');
      const expected = kind === 'image' || kind === 'button' || kind === 'space' ? 1 : 0;
      expect(problems.length, `${kind}: ${problems.map((p) => p.message).join('; ')}`).toBe(expected);
    }
  });
});
