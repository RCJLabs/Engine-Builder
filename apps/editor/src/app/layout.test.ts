import { describe, expect, it } from 'vitest';
import { activePanel, BREAKPOINTS, layoutFor, neighbourTab, visiblePanels, ZONES } from './layout.ts';

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
  it('reach every panel exactly once in every layout', () => {
    for (const zones of Object.values(ZONES)) {
      const all = zones.flatMap((z) => z.panels).sort();
      expect(all).toEqual(['inspector', 'logic', 'play', 'project', 'world']);
    }
  });

  it('show one panel per zone, defaulting to each zone first', () => {
    expect(visiblePanels('desktop', {})).toEqual(['project', 'world', 'inspector']);
    expect(visiblePanels('tablet', {})).toEqual(['world', 'inspector']);
    expect(visiblePanels('phone', {})).toEqual(['world']);
  });

  it('ignore a choice that belongs to another layout', () => {
    expect(activePanel('phone', 'only', { only: 'logic' })).toBe('logic');
    expect(activePanel('tablet', 'main', { main: 'inspector' })).toBe('world');
  });

  it('step through tabs and wrap at both ends', () => {
    expect(neighbourTab('phone', 'only', 'world', 1)).toBe('project');
    expect(neighbourTab('phone', 'only', 'world', -1)).toBe('play');
    expect(neighbourTab('desktop', 'right', 'inspector', 1)).toBe('inspector');
  });
});
