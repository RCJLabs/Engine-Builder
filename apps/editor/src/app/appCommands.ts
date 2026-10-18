/** The commands the palette offers right now: panels to show, project actions, and layout. */
import { editing, redoLabel, undoLabel } from '../editing/current.ts';
import { canOpenFolders } from '../projects/folders.ts';
import { pickZip } from '../projects/pickZip.ts';
import { busy, closeProject, current, exportCurrent, openFolder } from '../projects/session.ts';
import { startNewType } from '../types/open.ts';
import type { Command } from './commands.ts';
import { DOCK_PANELS, type DockPanelId, type PanelId, panelsOf, STRIP } from './layout.ts';
import { resetLayout, showPanel } from './panelControl.ts';
import { PANELS } from './panels.ts';
import { naming } from './projectUi.ts';
import { layout } from './state.ts';

const PANEL_ORDER: readonly PanelId[] = [
  'project',
  'records',
  'assets',
  'problems',
  'world',
  'inspector',
  'logic',
  'play',
  'console',
];

/** The panels this layout can bring forward: its own (a phone leaves the placeholders out, D35), but not a strip always in view. */
function panelCommands(): Command[] {
  const current = layout.value;
  const has = panelsOf(current);
  const ids: readonly DockPanelId[] =
    current === 'desktop' ? DOCK_PANELS : PANEL_ORDER.filter((id) => has.includes(id) && id !== STRIP[current]);
  return ids.map((id) => {
    const label = PANELS[id].label;
    return {
      id: `show-${id}`,
      title: `Show the ${label} panel`,
      keywords: 'go to open view tab',
      run: () => showPanel(id),
    };
  });
}

function projectCommands(): Command[] {
  // The session drops any action begun while another runs, so, like the panel's disabled buttons,
  // the palette leaves them out until it is done.
  if (busy.value !== null) return [];
  const commands: Command[] = [
    {
      id: 'new-project',
      title: 'New project',
      keywords: 'create start make',
      run: () => {
        closeProject();
        naming.value = true;
        showPanel('project');
      },
    },
    { id: 'import-zip', title: 'Import a zip', keywords: 'open load file upload project', run: pickZip },
  ];
  if (canOpenFolders()) {
    commands.push({
      id: 'open-folder',
      title: 'Open a folder',
      keywords: 'git disk directory local project',
      run: () => void openFolder(),
    });
  }
  const open = current.value;
  if (open) {
    const name = open.summary.project?.name ?? open.label;
    commands.push(
      {
        id: 'export-project',
        title: `Export ${name} as a zip`,
        keywords: 'download backup save project',
        run: () => void exportCurrent(),
      },
      { id: 'close-project', title: `Close ${name}`, keywords: 'project', run: closeProject },
    );
    if (editing.access.value.kind === 'editing') {
      commands.push({
        id: 'new-type',
        title: 'New record type',
        keywords: 'create make design schema fields kind',
        run: startNewType,
      });
    }
  }
  return commands;
}

/** Undo and redo, named for the step each would take, while there is one. */
function historyCommands(): Command[] {
  if (editing.access.value.kind !== 'editing') return [];
  const commands: Command[] = [];
  const back = undoLabel.value;
  const again = redoLabel.value;
  if (back)
    commands.push({ id: 'undo', title: `Undo: ${back}`, keywords: 'back revert', run: () => void editing.undo() });
  if (again)
    commands.push({ id: 'redo', title: `Redo: ${again}`, keywords: 'again forward', run: () => void editing.redo() });
  return commands;
}

export function appCommands(): Command[] {
  const commands = [...historyCommands(), ...projectCommands(), ...panelCommands()];
  if (layout.value === 'desktop') {
    commands.push({
      id: 'reset-layout',
      title: 'Reset the layout',
      keywords: 'panels dock default restore arrange',
      run: resetLayout,
    });
  }
  return commands;
}
