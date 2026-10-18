import { describe, expect, it } from 'vitest';
import {
  activePanel,
  BREAKPOINTS,
  DOCK_PANELS,
  layoutFor,
  neighbourTab,
  SHEET,
  visiblePanels,
  ZONES,
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
  it('reach every panel exactly once in every layout, counting the sheet', () => {
    for (const [layout, zones] of Object.entries(ZONES)) {
      const sheet = SHEET[layout as keyof typeof SHEET];
      const all = [...zones.flatMap((z) => z.panels), ...(sheet ? [sheet] : [])].sort();
      expect(all, layout).toEqual(['assets', 'inspector', 'logic', 'play', 'project', 'records', 'world']);
    }
  });

  it('dock the desktop zones’ panels and the console', () => {
    expect(DOCK_PANELS).toEqual(['project', 'logic', 'records', 'assets', 'world', 'play', 'inspector', 'console']);
  });

  it('show one panel per zone, defaulting to each zone first', () => {
    // The Records panel leads the wide zones (M2.5); the phone still opens on the world.
    expect(visiblePanels('desktop', {})).toEqual(['project', 'records', 'inspector']);
    expect(visiblePanels('tablet', {})).toEqual(['records', 'inspector']);
    expect(visiblePanels('phone', {})).toEqual(['world']);
  });

  it('ignore a choice that belongs to another layout', () => {
    expect(activePanel('phone', 'only', { only: 'logic' })).toBe('logic');
    expect(activePanel('tablet', 'main', { main: 'inspector' })).toBe('records');
  });

  it('step through tabs and wrap at both ends', () => {
    expect(neighbourTab('phone', 'only', 'world', 1)).toBe('project');
    expect(neighbourTab('phone', 'only', 'world', -1)).toBe('play');
    expect(neighbourTab('phone', 'only', 'project', 1)).toBe('records');
    expect(neighbourTab('phone', 'only', 'records', 1)).toBe('assets');
    expect(neighbourTab('phone', 'only', 'assets', 1)).toBe('logic');
    expect(neighbourTab('desktop', 'right', 'inspector', 1)).toBe('inspector');
  });
});
