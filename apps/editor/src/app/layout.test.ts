import { describe, expect, it } from 'vitest';
import {
  activePanel,
  BREAKPOINTS,
  DOCK_PANELS,
  layoutFor,
  MORE,
  neighbourTab,
  panelsOf,
  tabOf,
  tabsOf,
  visiblePanels,
  zoneOf,
} from './layout.ts';

describe('layoutFor', () => {
  it('switches exactly at the breakpoints', () => {
    expect(layoutFor(360)).toBe('phone');
    expect(layoutFor(BREAKPOINTS.tablet - 1)).toBe('phone');
    expect(layoutFor(BREAKPOINTS.tablet)).toBe('tablet');
    expect(layoutFor(844)).toBe('tablet');
    expect(layoutFor(BREAKPOINTS.desktop - 1)).toBe('tablet');
    expect(layoutFor(BREAKPOINTS.desktop)).toBe('desktop');
  });
});

describe('zones', () => {
  it('reach each panel once at most, and every panel on every layout', () => {
    for (const layout of ['desktop', 'tablet', 'phone'] as const) {
      const all = panelsOf(layout);
      expect(new Set(all).size, layout).toBe(all.length);
    }
    const every = [
      'assets',
      'console',
      'inspector',
      'logic',
      'outliner',
      'play',
      'problems',
      'project',
      'records',
      'scene',
      'world',
    ];
    expect(panelsOf('desktop').sort()).toEqual(every);
    expect(panelsOf('tablet').sort()).toEqual(every);
    // D37: a phone too, five panels on its bar and the rest behind More, which ends it.
    expect(panelsOf('phone').sort()).toEqual(every);
    expect(tabsOf('phone', 'only')).toEqual(['project', 'records', 'assets', 'logic', 'problems', 'more']);
    expect(MORE.phone).toEqual(['console', 'world', 'scene', 'play']);
    expect(tabsOf('tablet', 'main')).toEqual(['records', 'assets', 'world', 'scene', 'play']);
    expect(tabsOf('tablet', 'side')).toEqual(['inspector', 'outliner', 'project', 'problems', 'logic']);
    // D63: a phone's outliner is a tab of the inspector sheet, in no zone.
    expect(zoneOf('phone', 'outliner')).toBeUndefined();
  });

  it('show More’s list, or one of its panels with More’s tab chosen', () => {
    expect(activePanel('phone', 'only', { only: 'more' })).toBe('more');
    expect(activePanel('phone', 'only', { only: 'play' })).toBe('play');
    expect(tabOf('phone', 'play')).toBe('more');
    expect(tabOf('phone', 'more')).toBe('more');
    expect(tabOf('phone', 'logic')).toBe('logic');
    expect(tabOf('tablet', 'play')).toBe('play');
    expect(zoneOf('phone', 'console')).toBe('only');
    expect(zoneOf('phone', 'logic')).toBe('only');
    // The sheet's and the strip's are in no zone.
    expect(zoneOf('phone', 'inspector')).toBeUndefined();
    expect(zoneOf('tablet', 'console')).toBeUndefined();
    expect(zoneOf('tablet', 'play')).toBe('main');
  });

  it('dock the desktop zones’ panels, then the console and problems along the bottom', () => {
    expect(DOCK_PANELS).toEqual([
      'project',
      'logic',
      'records',
      'assets',
      'world',
      'scene',
      'play',
      'inspector',
      'outliner',
      'console',
      'problems',
    ]);
  });

  it('show one panel per zone, defaulting to each zone first', () => {
    // The Records panel leads the wide zones (M2.5); a phone opens on the Project panel (D35).
    expect(visiblePanels('desktop', {})).toEqual(['project', 'records', 'inspector']);
    expect(visiblePanels('tablet', {})).toEqual(['records', 'inspector']);
    expect(visiblePanels('phone', {})).toEqual(['project']);
  });

  it('ignore a choice that belongs to another layout', () => {
    expect(activePanel('phone', 'only', { only: 'problems' })).toBe('problems');
    expect(activePanel('phone', 'only', { only: 'inspector' })).toBe('project');
    expect(activePanel('tablet', 'main', { main: 'inspector' })).toBe('records');
    expect(activePanel('tablet', 'main', { main: 'more' })).toBe('records');
    expect(activePanel('tablet', 'side', { side: 'console' })).toBe('inspector');
  });

  it('step through tabs and wrap at both ends', () => {
    expect(neighbourTab('phone', 'only', 'project', 1)).toBe('records');
    expect(neighbourTab('phone', 'only', 'project', -1)).toBe('more');
    expect(neighbourTab('phone', 'only', 'records', 1)).toBe('assets');
    expect(neighbourTab('phone', 'only', 'assets', 1)).toBe('logic');
    expect(neighbourTab('phone', 'only', 'logic', 1)).toBe('problems');
    expect(neighbourTab('phone', 'only', 'problems', 1)).toBe('more');
    expect(neighbourTab('phone', 'only', 'more', 1)).toBe('project');
    // The Inspector and the Outliner share desktop's right zone when the dock can't load (M5.1).
    expect(neighbourTab('desktop', 'right', 'inspector', 1)).toBe('outliner');
    expect(neighbourTab('desktop', 'right', 'outliner', 1)).toBe('inspector');
  });
});
