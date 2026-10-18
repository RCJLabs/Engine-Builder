import { describe, expect, it } from 'vitest';
import { activePanel, BREAKPOINTS, DOCK_PANELS, layoutFor, neighbourTab, panelsOf, visiblePanels } from './layout.ts';

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
  it('reach each panel once at most, every panel on desktop and tablet, and on a phone those that do something', () => {
    for (const layout of ['desktop', 'tablet', 'phone'] as const) {
      const all = panelsOf(layout);
      expect(new Set(all).size, layout).toBe(all.length);
    }
    const every = ['assets', 'console', 'inspector', 'logic', 'play', 'problems', 'project', 'records', 'world'];
    expect(panelsOf('desktop').sort()).toEqual(every);
    expect(panelsOf('tablet').sort()).toEqual(every);
    // D35: World and Play join a phone's bar when their phases build them; Logic joined with M3.1 (D36).
    expect(panelsOf('phone').sort()).toEqual([
      'assets',
      'console',
      'inspector',
      'logic',
      'problems',
      'project',
      'records',
    ]);
  });

  it('dock the desktop zones’ panels, then the console and problems along the bottom', () => {
    expect(DOCK_PANELS).toEqual([
      'project',
      'logic',
      'records',
      'assets',
      'world',
      'play',
      'inspector',
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
    expect(activePanel('phone', 'only', { only: 'world' })).toBe('project');
    expect(activePanel('tablet', 'main', { main: 'inspector' })).toBe('records');
  });

  it('step through tabs and wrap at both ends', () => {
    expect(neighbourTab('phone', 'only', 'project', 1)).toBe('records');
    expect(neighbourTab('phone', 'only', 'project', -1)).toBe('console');
    expect(neighbourTab('phone', 'only', 'records', 1)).toBe('assets');
    expect(neighbourTab('phone', 'only', 'assets', 1)).toBe('logic');
    expect(neighbourTab('phone', 'only', 'logic', 1)).toBe('problems');
    expect(neighbourTab('desktop', 'right', 'inspector', 1)).toBe('inspector');
  });
});
