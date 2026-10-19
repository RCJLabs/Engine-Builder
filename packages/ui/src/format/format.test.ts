import { describe, expect, it } from 'vitest';
import { templatesOf, wantsOf, widgetsOf } from './bindings.ts';
import type { Screen, Widget } from './screen.ts';
import { hasBindings, splitTemplate } from './template.ts';
import { AA_BODY, CONTRAST_PAIRS, contrast, DEFAULT_THEME } from './theme.ts';

describe('splitTemplate', () => {
  it('splits text from facts, views and entries’ fields', () => {
    expect(splitTemplate('Day {time.day} of {economy.amount(resource: coins)}')).toEqual({
      ok: true,
      segments: [
        { kind: 'text', text: 'Day ' },
        { kind: 'fact', text: 'time.day', at: 5 },
        { kind: 'text', text: ' of ' },
        { kind: 'fact', text: 'economy.amount(resource: coins)', at: 19 },
      ],
    });
    expect(splitTemplate('{talk.speaker}: {talk.text}')).toEqual({
      ok: true,
      segments: [
        { kind: 'view', name: 'talk.speaker' },
        { kind: 'text', text: ': ' },
        { kind: 'view', name: 'talk.text' },
      ],
    });
    expect(splitTemplate('{ .price } coins')).toEqual({
      ok: true,
      segments: [
        { kind: 'field', name: 'price' },
        { kind: 'text', text: ' coins' },
      ],
    });
    expect(splitTemplate('')).toEqual({ ok: true, segments: [] });
  });

  it('says where the braces go wrong', () => {
    expect(splitTemplate('Day {time.day')).toEqual({ ok: false, message: 'This { isn’t closed', at: 4 });
    expect(splitTemplate('a } b')).toEqual({ ok: false, message: 'This } closes nothing', at: 2 });
    expect(splitTemplate('{a {b}}')).toEqual({ ok: false, message: 'A { inside { … } isn’t read', at: 3 });
    expect(splitTemplate('x { } y')).toEqual({
      ok: false,
      message: 'Name a fact between the braces, like {time.day}',
      at: 2,
    });
  });

  it('knows a template with no bindings', () => {
    expect(hasBindings('Rest')).toBe(false);
    expect(hasBindings('Day {time.day}')).toBe(true);
  });
});

const hud: Screen = {
  shows: ['hut'],
  top: { widget: 'text', text: 'Day {time.day}', 'shows-when': 'time.day > 0' },
  main: {
    widget: 'stack',
    children: [
      { widget: 'progress', value: '{hut.carried}', max: 5, label: 'Loads' },
      {
        widget: 'list',
        of: 'talk',
        empty: 'Quiet, {time.day}',
        item: { widget: 'button', label: '{.label}', action: { take: 'entry' } },
      },
      {
        widget: 'tabs',
        tabs: [
          { label: 'Bag {economy.amount(resource: coins)}', children: [{ widget: 'image', asset: 'a.png', alt: 'A' }] },
        ],
      },
    ],
  },
  bottom: { widget: 'button', label: 'Rest', action: { take: 'hut/rest' }, 'shows-when': 'time.day > 0' },
};

describe('what screens name', () => {
  it('walks every widget, region by region, depth first', () => {
    expect(widgetsOf(hud).map((w) => w.widget)).toEqual([
      'text',
      'stack',
      'progress',
      'list',
      'button',
      'tabs',
      'image',
      'button',
    ]);
  });

  it('reads each widget’s templates, numbers that bind among them', () => {
    const progress = (hud.main as Extract<Widget, { widget: 'stack' }>).children[0] as Widget;
    expect(templatesOf(progress)).toEqual(['Loads', '{hut.carried}']);
    expect(templatesOf({ widget: 'image', asset: 'a.png', alt: '{x.y}' })).toEqual([]);
  });

  it('gathers the facts and conditions, once each and sorted', () => {
    const broken: Screen = { main: { widget: 'text', text: '{oops' } };
    expect(wantsOf([hud, broken])).toEqual({
      facts: ['economy.amount(resource: coins)', 'hut.carried', 'time.day'],
      conditions: ['time.day > 0'],
    });
  });
});

describe('contrast', () => {
  it('is WCAG’s ratio: 21 for black on white, 1 for a colour on itself, the same either way', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrast('#7cc4ff', '#7cc4ff')).toBe(1);
    expect(contrast('#5a606a', '#14161a')).toBe(contrast('#14161a', '#5a606a'));
    // Worked by hand from WCAG 2's formula, and by a separate script.
    expect(contrast('#5a606a', '#14161a')).toBeCloseTo(2.86, 2);
    // A channel at or under 10 of 255 is on the formula's straight part, c / 12.92: 1.0607.
    expect(contrast('#000000', '#0a0a0a')).toBeCloseTo(1.0607, 4);
  });

  it('passes every pair of the engine’s own theme', () => {
    for (const [fore, back] of CONTRAST_PAIRS) {
      expect(contrast(DEFAULT_THEME.colors[fore], DEFAULT_THEME.colors[back])).toBeGreaterThanOrEqual(AA_BODY);
    }
  });
});
