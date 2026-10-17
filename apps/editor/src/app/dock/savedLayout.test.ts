import { describe, expect, it } from 'vitest';
import { LAYOUT_FORMAT, layoutText, readSavedLayout } from './savedLayout.ts';

const KNOWN = ['project', 'world', 'console'];
const panel = (id: string) => ({ id, contentComponent: id, title: id });
const layout = (ids: readonly string[]) => ({
  grid: { root: { type: 'branch', data: [] }, width: 800, height: 600, orientation: 'HORIZONTAL' },
  panels: Object.fromEntries(ids.map((id) => [id, panel(id)])),
  activeGroup: '1',
});

describe('readSavedLayout', () => {
  it('gives back what was saved', () => {
    const saved = layout(KNOWN);
    expect(readSavedLayout(layoutText(saved), KNOWN)).toEqual({ layout: saved, missing: [] });
  });

  it('names the panels added since the layout was saved', () => {
    expect(readSavedLayout(layoutText(layout(['project'])), KNOWN)?.missing).toEqual(['world', 'console']);
  });

  it('passes over anything it can’t give back whole', () => {
    const cases: [string, string | null][] = [
      ['nothing saved', null],
      ['not JSON', '{"format":1,'],
      ['another format', JSON.stringify({ format: LAYOUT_FORMAT + 1, layout: layout(KNOWN) })],
      ['no envelope', JSON.stringify(layout(KNOWN))],
      ['no grid', JSON.stringify({ format: 1, layout: { panels: layout(KNOWN).panels } })],
      ['no panels', layoutText({ ...layout([]), panels: {} })],
      ['a panel the editor doesn’t have', layoutText(layout(['project', 'records']))],
      [
        'a panel made by another component',
        layoutText({ ...layout(['project']), panels: { project: { id: 'project', contentComponent: 'world' } } }),
      ],
      ['an array for a panel', layoutText({ ...layout(['project']), panels: { project: [] } })],
    ];
    for (const [name, text] of cases) expect(readSavedLayout(text, KNOWN), name).toBeNull();
  });
});
