/**
 * The Play panel's screens (M4.1, D51): each screen under ui/, the theme, the feedback (M4.2) and
 * the shell (M4.3), opening in the inspector as JSON with their problems counted, New screen, and
 * New theme, New feedback and New shell while there is none.
 */
import { FEEDBACK_FILE, SHELL_FILE, screenPath, THEME_FILE } from '@eb/compiler';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { openUiFile } from '../screens/open.ts';
import { feedbackTemplate, screenTemplate, shellTemplate, themeTemplate } from '../screens/templates.ts';
import { createTextFiles } from '../scripts/scriptEdits.ts';

const count = (n: number) => `${n} ${n === 1 ? 'problem' : 'problems'}`;

function create(path: string, text: string, label: string): void {
  void editing.edit(label, (copy) => createTextFiles(copy, [[path, text]])).then(() => openUiFile(path));
}

export function ScreensList({ project }: { project: OpenProject }) {
  const { catalog, index } = project;
  const heading = useUniqueId();
  const [naming, setNaming] = useState(false);
  const canEdit = editing.access.value.kind === 'editing';
  const problemsOf = (path: string) =>
    [...catalog.problems, ...(index?.screens ?? [])].filter((p) => p.file === path).length;
  const files = [
    ...catalog.screens.map((id) => ({ path: screenPath(id), title: id })),
    ...(catalog.theme ? [{ path: THEME_FILE, title: 'Theme' }] : []),
    ...(catalog.feedback ? [{ path: FEEDBACK_FILE, title: 'Feedback' }] : []),
    ...(catalog.shell ? [{ path: SHELL_FILE, title: 'Shell' }] : []),
  ];
  return (
    <section class="logic-section" aria-labelledby={heading}>
      <div class="logic-head">
        <h3 id={heading}>Screens</h3>
        {canEdit ? (
          <div class="form-actions">
            <button type="button" class="button" onClick={() => setNaming(true)}>
              New screen
            </button>
            {catalog.theme ? null : (
              <button type="button" class="button" onClick={() => create(THEME_FILE, themeTemplate(), 'New theme')}>
                New theme
              </button>
            )}
            {catalog.feedback ? null : (
              <button
                type="button"
                class="button"
                onClick={() => create(FEEDBACK_FILE, feedbackTemplate(catalog.kits), 'New feedback')}
              >
                New feedback
              </button>
            )}
            {catalog.shell ? null : (
              <button
                type="button"
                class="button"
                onClick={() =>
                  create(
                    SHELL_FILE,
                    shellTemplate(project.summary.project?.name ?? project.label, catalog.kits),
                    'New shell',
                  )
                }
              >
                New shell
              </button>
            )}
          </div>
        ) : null}
      </div>
      {naming ? (
        <NameRecord
          type="screen"
          // ui/theme.json, ui/feedback.json and ui/shell.json are none of them screens, so no screen can be named so.
          ids={[...catalog.screens, 'theme', 'feedback', 'shell']}
          label="Name of the new screen"
          action="Create"
          fileOf={screenPath}
          done={(id, typed) => {
            setNaming(false);
            create(screenPath(id), screenTemplate(typed), `New screen ${id}`);
          }}
          cancel={() => setNaming(false)}
        />
      ) : null}
      {files.length === 0 ? (
        <p class="muted">
          No screens yet: the game plays as a list of what is on offer. A screen draws one of the game’s modes, or opens
          from a button, from text, buttons, lists and bars that read the game’s facts.
        </p>
      ) : (
        <ul class="logic-list">
          {files.map(({ path, title }) => (
            <li key={path}>
              <button type="button" class="logic-card" onClick={() => openUiFile(path)}>
                <span class="logic-title">{title}</span>
                <span class="muted">{problemsOf(path) > 0 ? count(problemsOf(path)) : 'No problems'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
