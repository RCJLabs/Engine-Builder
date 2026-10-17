/**
 * The editor's three layouts and which panels share a zone in each. The breakpoints are
 * written down here once: the shell sets `data-layout` from them and the CSS keys off that
 * attribute, so CSS and code can never disagree about which layout is showing.
 */
export type Layout = 'phone' | 'tablet' | 'desktop';
export type PanelId = 'project' | 'world' | 'inspector' | 'logic' | 'play';
export type ZoneId = 'left' | 'center' | 'right' | 'main' | 'side' | 'only';

/** Widths in CSS pixels at which the next layout starts. */
export const BREAKPOINTS = { tablet: 600, desktop: 1024 } as const;

export const layoutFor = (width: number): Layout =>
  width >= BREAKPOINTS.desktop ? 'desktop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'phone';

/** Zones in display order, each with its panels in tab order. The first panel is the default. */
export const ZONES: Record<Layout, readonly { zone: ZoneId; panels: readonly PanelId[] }[]> = {
  desktop: [
    { zone: 'left', panels: ['project', 'logic'] },
    { zone: 'center', panels: ['world', 'play'] },
    { zone: 'right', panels: ['inspector'] },
  ],
  tablet: [
    { zone: 'main', panels: ['world', 'play'] },
    { zone: 'side', panels: ['inspector', 'project', 'logic'] },
  ],
  phone: [{ zone: 'only', panels: ['world', 'project', 'inspector', 'logic', 'play'] }],
};

export type ActiveTabs = Partial<Record<ZoneId, PanelId>>;

/** The panel showing in a zone: the one chosen there, else the zone's first. */
export function activePanel(layout: Layout, zone: ZoneId, active: ActiveTabs): PanelId {
  const panels = ZONES[layout].find((z) => z.zone === zone)?.panels ?? [];
  const chosen = active[zone];
  return chosen && panels.includes(chosen) ? chosen : (panels[0] ?? 'world');
}

/** Every panel visible at once in a layout, one per zone. */
export const visiblePanels = (layout: Layout, active: ActiveTabs): PanelId[] =>
  ZONES[layout].map(({ zone }) => activePanel(layout, zone, active));

/** The panel after (or before) `current` in a zone's tab order, wrapping at the ends. */
export function neighbourTab(layout: Layout, zone: ZoneId, current: PanelId, step: 1 | -1): PanelId {
  const panels = ZONES[layout].find((z) => z.zone === zone)?.panels ?? [];
  const index = panels.indexOf(current);
  return panels[(index + step + panels.length) % panels.length] ?? current;
}
