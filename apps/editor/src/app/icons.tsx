import type { PanelId } from './layout.ts';

// 24×24 outline icons drawn with currentColor, so they follow the theme and the selected state.
const PATHS: Record<PanelId, string> = {
  project:
    'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  records:
    'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 9.5h16M4 14.5h16M9.5 9.5V20',
  world: 'M12 3 20 7.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  inspector: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  logic: 'M6 4v6a3 3 0 0 0 3 3h6M6 4a2 2 0 1 0 0 .01M18 13a2 2 0 1 0 0 .01M6 20a2 2 0 1 0 0 .01M6 10v8',
  play: 'M8 5.5v13a.5.5 0 0 0 .76.43l10.4-6.5a.5.5 0 0 0 0-.86L8.76 5.07A.5.5 0 0 0 8 5.5z',
};

export function PanelIcon({ panel }: { panel: PanelId }) {
  return (
    <svg class="tab-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        d={PATHS[panel]}
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

const ARROWS = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
} as const;

/** Undo and redo: an arrow curling back, and its mirror. */
export function HistoryIcon({ way }: { way: 'undo' | 'redo' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        d={ARROWS[way]}
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** The top bar's command palette button: a magnifier, the shape people look for to find a command. */
export function CommandsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.2 15.2 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
