/**
 * The editor's three layouts and which panels share a zone in each. The breakpoints are
 * written down here once: the shell sets `data-layout` from them and the CSS keys off that
 * attribute, so CSS and code can never disagree about which layout is showing.
 */
export type Layout = 'phone' | 'tablet' | 'desktop';
export type PanelId =
  | 'project'
  | 'records'
  | 'assets'
  | 'world'
  | 'inspector'
  | 'logic'
  | 'play'
  | 'problems'
  | 'console';
/** The panels desktop docks: every one. Tablet shows the console as a strip below its zones. */
export type DockPanelId = PanelId;
export type ZoneId = 'left' | 'center' | 'right' | 'main' | 'side' | 'only';

/** Widths in CSS pixels at which the next layout starts. */
export const BREAKPOINTS = { tablet: 600, desktop: 1024 } as const;

export const layoutFor = (width: number): Layout =>
  width >= BREAKPOINTS.desktop ? 'desktop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'phone';

/**
 * Zones in display order, each with its panels in tab order. The first panel is the default. The
 * Records panel (M2.5) leads the wide zones, since the World panel waits for Phase 4; the Assets
 * panel (M2.7) sits beside it. A phone's bar holds the panels that do something (D35, Evan's
 * call): World, Logic and Play join it when their phases build them.
 */
export const ZONES: Record<Layout, readonly { zone: ZoneId; panels: readonly PanelId[] }[]> = {
  desktop: [
    { zone: 'left', panels: ['project', 'logic'] },
    { zone: 'center', panels: ['records', 'assets', 'world', 'play'] },
    { zone: 'right', panels: ['inspector'] },
  ],
  tablet: [
    { zone: 'main', panels: ['records', 'assets', 'world', 'play'] },
    { zone: 'side', panels: ['inspector', 'project', 'problems', 'logic'] },
  ],
  phone: [{ zone: 'only', panels: ['project', 'records', 'assets', 'problems', 'console'] }],
};

/**
 * Desktop's group along the bottom, below the zones' groups (M2.8): the console in front, as since
 * M2.2, so what the editor says stays in view; Problems beside it, its tab showing the count.
 */
export const DOCK_BOTTOM: readonly PanelId[] = ['console', 'problems'];

/** The panel each layout shows in a bottom sheet over its zones: on a phone, the inspector, so it sits over what it inspects. */
export const SHEET: Record<Layout, PanelId | null> = { desktop: null, tablet: null, phone: 'inspector' };

/** Desktop's dock: the zones' groups side by side, then the bottom group (M2.2, M2.8). */
export const DOCK_PANELS: readonly DockPanelId[] = [...ZONES.desktop.flatMap((zone) => zone.panels), ...DOCK_BOTTOM];

/** Tablet's strip below its zones: the console, always in view. */
export const STRIP: Record<Layout, PanelId | null> = { desktop: null, tablet: 'console', phone: null };

/** The panels a layout can show: its zones', its sheet's and its strip's, or the dock's. */
export function panelsOf(layout: Layout): PanelId[] {
  if (layout === 'desktop') return [...DOCK_PANELS];
  const shown = ZONES[layout].flatMap((zone) => zone.panels);
  const sheet = SHEET[layout];
  const strip = STRIP[layout];
  return [...shown, ...(sheet ? [sheet] : []), ...(strip ? [strip] : [])];
}

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
