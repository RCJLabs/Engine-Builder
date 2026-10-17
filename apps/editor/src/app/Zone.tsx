import type { TargetedKeyboardEvent } from 'preact';
import { PanelIcon } from './icons.tsx';
import { activePanel, neighbourTab, type PanelId, ZONES, type ZoneId } from './layout.ts';
import { Panel } from './Panel.tsx';
import { PANELS } from './panels.ts';
import { activeTabs, layout } from './state.ts';

const tabId = (zone: ZoneId, panel: PanelId) => `tab-${zone}-${panel}`;
const panelId = (zone: ZoneId, panel: PanelId) => `panel-${zone}-${panel}`;

/** One zone of the shell: a tab strip (when it holds more than one panel) and the active panel. */
export function Zone({ zone }: { zone: ZoneId }) {
  const current = layout.value;
  const panels = ZONES[current].find((z) => z.zone === zone)?.panels ?? [];
  const active = activePanel(current, zone, activeTabs.value);

  const select = (panel: PanelId, focus = false): void => {
    activeTabs.value = { ...activeTabs.value, [zone]: panel };
    if (focus) requestAnimationFrame(() => document.getElementById(tabId(zone, panel))?.focus());
  };

  // WAI-ARIA tabs: arrows move between tabs, Home and End jump to the ends.
  const onKeyDown = (event: TargetedKeyboardEvent<HTMLDivElement>): void => {
    const keys: Record<string, PanelId | undefined> = {
      ArrowRight: neighbourTab(current, zone, active, 1),
      ArrowLeft: neighbourTab(current, zone, active, -1),
      Home: panels[0],
      End: panels[panels.length - 1],
    };
    const target = keys[event.key];
    if (!target) return;
    event.preventDefault();
    select(target, true);
  };

  const tabs =
    panels.length > 1 ? (
      <div class="tabs" role="tablist" aria-label={`${zone} panels`} onKeyDown={onKeyDown}>
        {panels.map((panel) => (
          <button
            key={panel}
            id={tabId(zone, panel)}
            type="button"
            role="tab"
            class="tab"
            aria-selected={panel === active}
            aria-controls={panelId(zone, panel)}
            tabIndex={panel === active ? 0 : -1}
            onClick={() => select(panel)}
          >
            <PanelIcon panel={panel} />
            <span class="tab-label">{PANELS[panel].label}</span>
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div class="zone" data-zone={zone}>
      {tabs}
      {tabs ? (
        <div
          class="zone-body"
          id={panelId(zone, active)}
          role="tabpanel"
          aria-labelledby={tabId(zone, active)}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a tabpanel takes focus (WAI-ARIA tabs pattern), and it scrolls, so keyboard users must reach it (axe scrollable-region-focusable)
          tabIndex={0}
        >
          <Panel id={active} />
        </div>
      ) : (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the zone scrolls, so keyboard users must reach it (axe scrollable-region-focusable)
        <section class="zone-body" id={panelId(zone, active)} aria-label={PANELS[active].label} tabIndex={0}>
          <Panel id={active} />
        </section>
      )}
    </div>
  );
}
