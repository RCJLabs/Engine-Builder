/**
 * Desktop's layout (M2.2): the editor's panels as dockview tabs and groups, saved to this browser
 * as they change and restored on the next visit. Only the desktop layout loads this module, so a
 * phone never runs dockview's 90 kB.
 */
import { DockviewComponent, type IContentRenderer, type ITabRenderer } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import '../../styles/dock.css';
import { effect } from '@preact/signals';
import { render } from 'preact';
import { badgeText, problemCount } from '../../problems/count.ts';
import { Console } from '../Console.tsx';
import { DOCK_BOTTOM, DOCK_PANELS, type DockPanelId, type PanelId, ZONES } from '../layout.ts';
import { Panel } from '../Panel.tsx';
import { PANELS } from '../panels.ts';
import { noteError } from '../state.ts';
import { LAYOUT_KEY, layoutText, readSavedLayout } from './savedLayout.ts';

export interface DockHandle {
  /** Brings a panel's tab to the front of its group, makes the group active and moves focus into the panel. */
  show(id: DockPanelId): void;
  /** Forgets the saved layout and lays the panels out as on a first visit. */
  reset(): void;
  dispose(): void;
}

const THEME = { name: 'eb', className: 'dockview-theme-eb' };
// Width of the side groups and height of the console when the layout is new, in CSS pixels.
const SIDE_WIDTH = { left: 280, right: 320 } as const;
const CONSOLE_HEIGHT = 150;
const SAVE_AFTER_MS = 300;

const titleOf = (id: DockPanelId) => PANELS[id].label;

/** Where a panel added since a layout was saved goes: beside the panel it sits with by default. */
const PEERS: Partial<Record<PanelId, PanelId>> = { assets: 'records', problems: 'console' };

/**
 * A panel's content: the same Preact panel the zones show. dockview already makes each group a
 * region and its content a tabpanel named by the tab, so this is a plain block, focusable so
 * keyboard users can scroll it; a named section here would repeat the group's landmark.
 */
function contentRenderer(id: DockPanelId): IContentRenderer {
  const element = document.createElement('div');
  element.className = id === 'console' ? 'dock-panel dock-console' : 'dock-panel';
  // The console's own list takes the tab stop, so its block takes focus only from the palette.
  element.tabIndex = id === 'console' ? -1 : 0;
  return {
    element,
    init: () => render(id === 'console' ? <Console docked /> : <Panel id={id as PanelId} />, element),
    dispose: () => render(null, element),
  };
}

/**
 * A tab that is only its title. dockview's own tab holds a close button inside the tab, which axe
 * reports as nested controls; the editor's panels are moved, never closed.
 */
function labelRenderer(): ITabRenderer {
  const element = document.createElement('span');
  element.className = 'dock-tab';
  let stop: (() => void) | undefined;
  return {
    element,
    init: (params) => {
      const title = params.title ?? params.api.title ?? '';
      element.textContent = title;
      // The Problems tab carries its count (M2.8), drawn here rather than set as its title, which
      // dockview would save as a change to the layout.
      if (params.api.id !== 'problems') return;
      stop = effect(() => {
        const count = badgeText(problemCount.value);
        element.textContent = count ? `${title} (${count})` : title;
      });
    },
    dispose: () => stop?.(),
  };
}

function lay(dock: DockviewComponent, id: DockPanelId, position?: object, inactive = false): void {
  dock.addPanel({ id, component: id, title: titleOf(id), inactive, ...(position ? { position } : {}) } as Parameters<
    DockviewComponent['addPanel']
  >[0]);
}

/** The first layout: the desktop zones side by side as groups, the console along the bottom. */
function layDefault(dock: DockviewComponent): void {
  let previous: PanelId | null = null;
  for (const { panels } of ZONES.desktop) {
    const [first, ...rest] = panels as [PanelId, ...PanelId[]];
    lay(dock, first, previous ? { referencePanel: previous, direction: 'right' } : undefined);
    for (const id of rest) lay(dock, id, { referencePanel: first, direction: 'within' }, true);
    previous = first;
  }
  const [bottom, ...below] = DOCK_BOTTOM as [PanelId, ...PanelId[]];
  lay(dock, bottom, { direction: 'below' });
  for (const id of below) lay(dock, id, { referencePanel: bottom, direction: 'within' }, true);
  const size = (id: DockPanelId, event: { width?: number; height?: number }) =>
    dock.getGroupPanel(id)?.group.api.setSize(event);
  size(ZONES.desktop[0]?.panels[0] as PanelId, { width: SIDE_WIDTH.left });
  size(ZONES.desktop[2]?.panels[0] as PanelId, { width: SIDE_WIDTH.right });
  size(bottom, { height: CONSOLE_HEIGHT });
}

function restore(dock: DockviewComponent, storage: Storage | null): void {
  let text: string | null = null;
  try {
    text = storage?.getItem(LAYOUT_KEY) ?? null;
  } catch {
    // Storage turned off: the default layout it is.
  }
  const saved = readSavedLayout(text, DOCK_PANELS);
  if (saved) {
    try {
      dock.fromJSON(saved.layout as Parameters<DockviewComponent['fromJSON']>[0]);
      // Panels added to the editor since the layout was saved, and any it names but places in no
      // group, which dockview drops, join their peer's group, or the active one.
      for (const id of DOCK_PANELS.filter((panel) => !dock.getGroupPanel(panel))) {
        const peer = PEERS[id];
        lay(
          dock,
          id,
          peer && dock.getGroupPanel(peer) ? { referencePanel: peer, direction: 'within' } : undefined,
          true,
        );
      }
      return;
    } catch (error) {
      // dockview has already taken down whatever it built before it threw.
      noteError(`The saved layout couldn’t be restored, so the panels are back where they started (${String(error)}).`);
    }
  }
  layDefault(dock);
}

/** One dockview over `element`, laid out from storage, that saves its layout there as it changes. */
function startDock(element: HTMLElement, storage: Storage | null) {
  const bodies = new Map<DockPanelId, HTMLElement>();
  const dock = new DockviewComponent(element, {
    theme: THEME,
    disableFloatingGroups: true,
    // Every tab, including those of a layout saved by an older editor, is a plain label.
    defaultTabComponent: 'label',
    createComponent: (options) => {
      const renderer = contentRenderer(options.name as DockPanelId);
      bodies.set(options.name as DockPanelId, renderer.element);
      return renderer;
    },
    createTabComponent: () => labelRenderer(),
  });
  restore(dock, storage);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = undefined;
    try {
      storage?.setItem(LAYOUT_KEY, layoutText(dock.toJSON()));
    } catch {
      // Storage full or turned off: the layout lasts this visit only.
    }
  };
  // dockview reports changes a microtask late and skips any made before this listener, so laying
  // the dock out above saves nothing: an untouched dock keeps following the editor's default.
  const changes = dock.onDidLayoutChange(() => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_AFTER_MS);
  });
  return {
    dock,
    /** Each panel's content element, to move focus into. */
    bodies,
    /** Takes the dock down, first saving a change still waiting if `keep`. */
    stop: (keep: boolean) => {
      if (keep && timer !== undefined) save();
      clearTimeout(timer);
      changes.dispose();
      dock.dispose();
    },
  };
}

export function mountDock(element: HTMLElement, storage: Storage | null): DockHandle {
  let current = startDock(element, storage);
  return {
    show: (id) => {
      current.dock.getGroupPanel(id)?.api.setActive();
      current.bodies.get(id)?.focus();
    },
    // Forgotten and started afresh, as on a first visit, so a reset dock follows the default too.
    reset: () => {
      current.stop(false);
      try {
        storage?.removeItem(LAYOUT_KEY);
      } catch {
        // Storage turned off: nothing was saved.
      }
      current = startDock(element, storage);
    },
    dispose: () => current.stop(true),
  };
}
