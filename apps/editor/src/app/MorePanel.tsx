/**
 * More (D37, Evan's call): the panels past a phone's bar, each a row saying what it holds, and
 * the way back to the list above one of them. A placeholder says which phase builds it.
 */
import { BackIcon, PanelIcon } from './icons.tsx';
import type { PanelId } from './layout.ts';
import { PANELS, PLACEHOLDERS } from './panels.ts';

export function MoreList({ panels, pick }: { panels: readonly PanelId[]; pick: (panel: PanelId) => void }) {
  return (
    <div class="panel more-list" data-panel="more">
      <h2 class="visually-hidden">More panels</h2>
      <ul class="more-items">
        {panels.map((panel) => (
          <MoreItem key={panel} panel={panel} pick={pick} />
        ))}
      </ul>
    </div>
  );
}

function MoreItem({ panel, pick }: { panel: PanelId; pick: (panel: PanelId) => void }) {
  const info = PANELS[panel];
  // Named by all it shows, the summary too: a name of the label alone hides visible words from
  // speech input (WCAG 2.5.3, axe's label-content-name-mismatch).
  return (
    <li>
      <button type="button" class="more-item" onClick={() => pick(panel)}>
        <PanelIcon panel={panel} />
        {/* The spaces keep the name's words apart: "Console What the editor did…", not "ConsoleWhat". */}
        <span class="more-text">
          <span class="more-label">{info.label}</span> <span class="more-summary">{info.summary}</span>
        </span>{' '}
        {PLACEHOLDERS.has(panel) ? <span class="badge">{info.phase}</span> : null}
      </button>
    </li>
  );
}

/** Above a panel shown from More: the way back to the list, as tapping the More tab is too. */
export function MoreBack({ back }: { back: () => void }) {
  return (
    <div class="more-back">
      <button type="button" class="button more-back-button" onClick={back}>
        <BackIcon />
        Back to More
      </button>
    </div>
  );
}
