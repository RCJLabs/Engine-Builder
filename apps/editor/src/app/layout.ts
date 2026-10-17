/**
 * The editor's three layouts and which panels share a zone in each. The breakpoints are
 * written down here once: the shell sets `data-layout` from them and the CSS keys off that
 * attribute, so CSS and code can never disagree about which layout is showing.
 */
export type Layout = 'phone' | 'tablet' | 'desktop';
export type PanelId = 'project' | 'records' | 'world' | 'inspector' | 'logic' | 'play';
/** Desktop docks the console too; tablet shows it as a strip and a phone leaves it out. */
export type DockPanelId = PanelId | 'console';
export type ZoneId = 'left' | 'center' | 'right' | 'main' | 'side' | 'only';

/** Widths in CSS pixels at which the next layout starts. */
export const BREAKPOINTS = { tablet: 600, desktop: 1024 } as const;

export const layoutFor = (width: number): Layout =>
  width >= BREAKPOINTS.desktop ? 'desktop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'phone';

/**
 * Zones in display order, each with its panels in tab order. The first panel is the default. The
 * Records panel (M2.5) leads the wide zones, since the World panel waits for Phase 4.
 */
export const ZONES: Record<Layout, readonly { zone: ZoneId; panels: readonly PanelId[] }[]> = {
  desktop: [
    { zone: 'left', panels: ['project', 'logic'] },
    { zone: 'center', panels: ['records', 'world', 'play'] },
    { zone: 'right', panels: ['inspector'] },
  ],
  tablet: [
    { zone: 'main', panels: ['records', 'world', 'play'] },
    { zone: 'side', panels: ['inspector', 'project', 'logic'] },
  ],
  phone: [{ zone: 'only', panels: ['world', 'project', 'records', 'logic', 'play'] }],
};

/** The panel each layout shows in a bottom sheet over its zones: on a phone, the inspector, so it sits over what it inspects. */
export const SHEET: Record<Layout, PanelId | null> = { desktop: null, tablet: null, phone: 'inspector' };

/** Desktop's dock: the zones' groups side by side, then the console along the bottom (M2.2). */
export const DOCK_PANELS: readonly DockPanelId[] = [...ZONES.desktop.flatMap((zone) => zone.panels), 'console'];

export type ActiveTabs = Partial<Record<ZoneId, PanelId>>;

/** The page ids of a zone's tab and tab panel, shared by the zone and the palette's Show commands. */
export const zoneTabId = (zone: ZoneId, panel: PanelId) => `tab-${zone}-${panel}`;
export const zonePanelId = (zone: ZoneId, panel: PanelId) => `panel-${zone}-${panel}`;

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
