/**
 * A screen or the theme in the inspector (M4.1, D51): its JSON in CodeMirror, its problems, each a
 * way to its line, as a scene's are. Typing is an edit like a script's, which the editor's undo
 * takes back. M4.5's designer replaces the JSON. Loaded when a screen is first opened.
 */
import { classifyUi } from '@eb/compiler';
import { useMemo, useRef, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { chosen } from '../forms/selection.ts';
import type { OpenProject } from '../projects/opened.ts';
import type { CodeEditor } from '../scripts/codeEditor.ts';
import { CodeProblems, useCode, useTextFile } from '../scripts/codeFile.tsx';
import { deleteFile, setFileText } from '../scripts/scriptEdits.ts';
import { json } from './jsonLanguage.ts';
import { uiLineToFocus } from './open.ts';
import '../styles/scripts.css';

type Kind = 'screen' | 'theme' | 'feedback';

const HELP: Readonly<Record<Kind, string>> = {
  screen:
    'A screen: its title, the modes it shows, whether it is modal, and its top, main and bottom, each a widget: stack, panel, grid, text, image, button, progress, list, tabs or log. Text shows facts in braces, like {time.day}. Tab indents, and Esc then Tab moves on.',
  theme:
    'The theme: six colours (background, surface, text, muted, accent, on-accent) as #rrggbb, each text pair at 4.5:1 or more, and the font, size, space and radius. Tab indents, and Esc then Tab moves on.',
  feedback:
    'The feedback: lines, each on an event the game declares, saying words whose holes are its arguments, like {.item}; where matches some of them, and to is toast, log or both. Each beat is said by the first line that matches it. Tab indents, and Esc then Tab moves on.',
};

const NAMES: Readonly<Record<Exclude<Kind, 'screen'>, { heading: string; label: string }>> = {
  theme: { heading: 'Theme', label: 'The theme' },
  feedback: { heading: 'Feedback', label: 'The feedback' },
};

export function ScreenEditor({ project, path }: { project: OpenProject; path: string }) {
  const role = classifyUi(path);
  const kind: Kind = role.kind === 'theme' || role.kind === 'feedback' ? role.kind : 'screen';
  const named = kind === 'screen' ? undefined : NAMES[kind];
  const title = role.kind === 'screen' ? role.id : kind;
  const [deleting, setDeleting] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const code = useRef<CodeEditor | null>(null);
  const screens = project.index?.screens;
  const problems = useMemo(
    () => [...project.catalog.problems, ...(screens ?? [])].filter((p) => p.file === path),
    [project.catalog, screens, path],
  );
  const loaded = useTextFile(project, path, code);
  const setup = {
    id: path,
    path,
    type: (text: string) => editing.edit(`Edit ${path}`, (copy) => setFileText(copy, path, text), `ui:${path}`),
    focus: uiLineToFocus,
    language: json,
  };
  useCode(host, code, loaded, setup, problems);
  const canEdit = editing.access.value.kind === 'editing';
  const ready = loaded?.kind === 'ok';
  const go = (line: number, column?: number) => code.current?.focusAt(line, column);
  return (
    <section class="script-editor" aria-label={named?.label ?? `Screen ${title}`}>
      <header class="record-head">
        <h3>{named?.heading ?? `Screen ${title}`}</h3>
        {canEdit && loaded?.kind !== 'missing' ? (
          <div class="form-actions">
            <button type="button" class="button danger" onClick={() => setDeleting(true)}>
              Delete
            </button>
          </div>
        ) : null}
      </header>
      <p class="muted mono">{path}</p>
      {deleting ? <DeleteUiFile path={path} cancel={() => setDeleting(false)} /> : null}
      {loaded === null ? <p class="muted">Reading {path}…</p> : null}
      {loaded?.kind === 'missing' ? <p class="muted">{path} isn’t there any more. Undo brings it back.</p> : null}
      {loaded?.kind === 'unreadable' ? (
        <p class="logic-problem">{path} isn’t UTF-8 text, so it can’t be edited here.</p>
      ) : null}
      <div ref={host} class="script-code" data-project-field hidden={!ready} />
      {ready ? (
        <>
          <p class="form-help">{HELP[kind]}</p>
          <CodeProblems problems={problems} go={go} label={`Problems in this ${kind}`} />
        </>
      ) : null}
    </section>
  );
}

/** Deleting asks first: a button that opens a screen shows a problem until it doesn't. */
function DeleteUiFile({ path, cancel }: { path: string; cancel: () => void }) {
  return (
    <div class="confirm">
      <p>{`Delete ${path}? Undo brings it back.`}</p>
      <div class="form-actions">
        <button
          type="button"
          class="button danger"
          onClick={() => {
            chosen.value = null;
            void editing.edit(`Delete ${path}`, (copy) => deleteFile(copy, path));
          }}
        >
          {`Delete ${path.slice(path.lastIndexOf('/') + 1)}`}
        </button>
        <button type="button" class="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
