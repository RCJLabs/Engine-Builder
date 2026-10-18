import type { TargetedKeyboardEvent } from 'preact';
import { useEffect } from 'preact/hooks';
import { ProblemBadge } from '../problems/ProblemBadge.tsx';
import { InspectorSheet } from './InspectorSheet.tsx';
import { MoreIcon, PanelIcon } from './icons.tsx';
import {
  activePanel,
  MORE,
  neighbourTab,
  type PanelId,
  zonePanelId as panelId,
  SHEET,
  type TabId,
  zoneTabId as tabId,
  tabOf,
  tabsOf,
  ZONES,
  type ZoneId,
} from './layout.ts';
import { MoreBack, MoreList } from './MorePanel.tsx';
import { Panel } from './Panel.tsx';
import { PANELS } from './panels.ts';
import { activeTabs, layout } from './state.ts';

const labelOf = (tab: TabId) => (tab === 'more' ? 'More' : PANELS[tab].label);

/**
 * One zone of the shell: a tab strip (when it holds more than one panel) and the panel shown. A
 * phone's strip ends in More (D37), whose tab stays chosen while its list or one of its panels shows.
 */
export function Zone({ zone }: { zone: ZoneId }) {
  const current = layout.value;
  const tabs = tabsOf(current, zone);
  const view = activePanel(current, zone, activeTabs.value);
  const selected = tabOf(current, view);

  useEffect(() => {
    document.getElementById(tabId(zone, selected))?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [zone, selected]);

  const show = (next: PanelId | 'more', focus?: 'tab' | 'panel'): void => {
    activeTabs.value = { ...activeTabs.value, [zone]: next };
    const tab = tabOf(current, next);
    const target = focus === 'tab' ? tabId(zone, tab) : panelId(zone, tab);
    if (focus) requestAnimationFrame(() => document.getElementById(target)?.focus());
  };

  // WAI-ARIA tabs: arrows move between tabs, Home and End jump to the ends.
  const onKeyDown = (event: TargetedKeyboardEvent<HTMLDivElement>): void => {
    const keys: Record<string, TabId | undefined> = {
      ArrowRight: neighbourTab(current, zone, selected, 1),
      ArrowLeft: neighbourTab(current, zone, selected, -1),
      Home: tabs[0],
      End: tabs[tabs.length - 1],
    };
    const target = keys[event.key];
    if (!target) return;
    event.preventDefault();
    show(target, 'tab');
  };

  const strip =
    tabs.length > 1 ? (
      // A zone narrower than its tabs scrolls them sideways (data-scroll-x), the active one kept in view.
      <div class="tabs" role="tablist" aria-label={`${zone} panels`} data-scroll-x onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab}
            id={tabId(zone, tab)}
            type="button"
            role="tab"
            class="tab"
            aria-selected={tab === selected}
            aria-controls={panelId(zone, tab)}
            tabIndex={tab === selected ? 0 : -1}
            // More shows its list, even from one of its own panels, as a phone's More tab does.
            onClick={() => show(tab)}
          >
            {tab === 'more' ? <MoreIcon /> : <PanelIcon panel={tab} />}
            <span class="tab-label">{labelOf(tab)}</span>
            {tab === 'problems' ? <ProblemBadge /> : null}
          </button>
        ))}
      </div>
    ) : null;

  const body =
    view === 'more' ? (
      <MoreList panels={MORE[current]} pick={(panel) => show(panel, 'panel')} />
    ) : (
      <>
        {selected === 'more' ? <MoreBack back={() => show('more', 'panel')} /> : null}
        <Panel id={view} />
      </>
    );

  // A layout with a sheet keeps it in its first zone, between the panel and the tab bar.
  const sheet = SHEET[current] && ZONES[current][0]?.zone === zone ? <InspectorSheet /> : null;
  return (
    <div class="zone" data-zone={zone}>
      {strip}
      {strip ? (
        <div
          class="zone-body"
          id={panelId(zone, selected)}
          role="tabpanel"
          aria-labelledby={tabId(zone, selected)}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a tabpanel takes focus (WAI-ARIA tabs pattern), and it scrolls, so keyboard users must reach it (axe scrollable-region-focusable)
          tabIndex={0}
        >
          {body}
        </div>
      ) : (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the zone scrolls, so keyboard users must reach it (axe scrollable-region-focusable)
        <section class="zone-body" id={panelId(zone, selected)} aria-label={labelOf(selected)} tabIndex={0}>
          {body}
        </section>
      )}
      {sheet}
    </div>
  );
}
