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
/** A tab: a panel's, or More, which lists the panels past a phone's bar (D37). */
export type TabId = PanelId | 'more';

/** Widths in CSS pixels at which the next layout starts. */
export const BREAKPOINTS = { tablet: 600, desktop: 1024 } as const;

export const layoutFor = (width: number): Layout =>
  width >= BREAKPOINTS.desktop ? 'desktop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'phone';

/**
 * Zones in display order, each with its panels in tab order. The first panel is the default. The
 * Records panel (M2.5) leads the wide zones, since the World panel waits for Phase 4; the Assets
 * panel (M2.7) sits beside it. A phone's bar holds five panels, Logic fourth since M3.1 (D36),
 * then More for the rest (D37, Evan's call): every panel in reach, every label whole at 360 px.
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
  phone: [{ zone: 'only', panels: ['project', 'records', 'assets', 'logic', 'problems'] }],
};

/** The panels behind a layout's More tab, in its first zone (D37): a phone's Console, World and Play. */
export const MORE: Record<Layout, readonly PanelId[]> = {
  desktop: [],
  tablet: [],
  phone: ['console', 'world', 'play'],
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

/** The panels a layout can show: its zones' and More's, its sheet's and its strip's, or the dock's. */
export function panelsOf(layout: Layout): PanelId[] {
  if (layout === 'desktop') return [...DOCK_PANELS];
  const shown = ZONES[layout].flatMap((zone) => zone.panels);
  const sheet = SHEET[layout];
  const strip = STRIP[layout];
  return [...shown, ...MORE[layout], ...(sheet ? [sheet] : []), ...(strip ? [strip] : [])];
}

/** What each zone shows: a panel, or More's list. */
export type ActiveTabs = Partial<Record<ZoneId, PanelId | 'more'>>;

/** The page ids of a zone's tab and tab panel, shared by the zone and the palette's Show commands. */
export const zoneTabId = (zone: ZoneId, tab: TabId) => `tab-${zone}-${tab}`;
export const zonePanelId = (zone: ZoneId, tab: TabId) => `panel-${zone}-${tab}`;

/** Whether a zone ends in the More tab: a layout's first zone, when it has panels past its bar. */
const hasMore = (layout: Layout, zone: ZoneId) => MORE[layout].length > 0 && ZONES[layout][0]?.zone === zone;

/** A zone's tabs in order: its panels', then More's. */
export function tabsOf(layout: Layout, zone: ZoneId): TabId[] {
  const panels = ZONES[layout].find((z) => z.zone === zone)?.panels ?? [];
  return hasMore(layout, zone) ? [...panels, 'more'] : [...panels];
}

/** The zone that shows a panel, by its tab or behind More. */
export function zoneOf(layout: Layout, panel: PanelId): ZoneId | undefined {
  const zone = ZONES[layout].find((z) => z.panels.includes(panel))?.zone;
  return zone ?? (MORE[layout].includes(panel) ? ZONES[layout][0]?.zone : undefined);
}

/** The tab selected while `view` shows: More's for its list and the panels behind it. */
export const tabOf = (layout: Layout, view: PanelId | 'more'): TabId =>
  view !== 'more' && MORE[layout].includes(view) ? 'more' : view;

/** What a zone shows: the panel or More's list chosen there, else the zone's first panel. */
export function activePanel(layout: Layout, zone: ZoneId, active: ActiveTabs): PanelId | 'more' {
  const panels = ZONES[layout].find((z) => z.zone === zone)?.panels ?? [];
  const chosen = active[zone];
  const more = hasMore(layout, zone);
  const reachable =
    chosen === 'more'
      ? more
      : chosen !== undefined && (panels.includes(chosen) || (more && MORE[layout].includes(chosen)));
  return chosen !== undefined && reachable ? chosen : (panels[0] ?? 'world');
}

/** What each zone of a layout shows at once. */
export const visiblePanels = (layout: Layout, active: ActiveTabs): (PanelId | 'more')[] =>
  ZONES[layout].map(({ zone }) => activePanel(layout, zone, active));

/** The tab after (or before) `current` in a zone's tab order, wrapping at the ends. */
export function neighbourTab(layout: Layout, zone: ZoneId, current: TabId, step: 1 | -1): TabId {
  const tabs = tabsOf(layout, zone);
  const index = tabs.indexOf(current);
  return tabs[(index + step + tabs.length) % tabs.length] ?? current;
}
