/**
 * A screen or the theme in the inspector (M4.1, D51): since M4.5 (D55) designed as it looks, with
 * its JSON in CodeMirror as a second view of the same file and the same undo; the feedback and the
 * shell as JSON alone. The JSON's problems are each a way to its line, as a scene's are. Loaded
 * when a screen is first opened.
 */
import { classifyUi } from '@eb/compiler';
import { useMemo, useRef, useState } from 'preact/hooks';
import { ScreenDesigner } from '../designer/ScreenDesigner.tsx';
import { ThemeDesigner } from '../designer/ThemeDesigner.tsx';
import { editing } from '../editing/current.ts';
import { chosen } from '../forms/selection.ts';
import type { OpenProject } from '../projects/opened.ts';
import type { CodeEditor } from '../scripts/codeEditor.ts';
import { CodeProblems, useCode, useTextFile } from '../scripts/codeFile.tsx';
import { deleteFile, setFileText } from '../scripts/scriptEdits.ts';
import { json } from './jsonLanguage.ts';
import { uiLineToFocus, uiView } from './open.ts';
import '../styles/scripts.css';
import '../styles/designer.css';

type Kind = 'screen' | 'theme' | 'feedback' | 'shell';

const HELP: Readonly<Record<Kind, string>> = {
  screen:
    'A screen: its title, the modes it shows, whether it is modal, and its top, main and bottom, each a widget: stack, panel, grid, text, image, button, progress, list, tabs or log. Text shows facts in braces, like {time.day}. Tab indents, and Esc then Tab moves on.',
  theme:
    'The theme: six colours (background, surface, text, muted, accent, on-accent) as #rrggbb, each text pair at 4.5:1 or more, and the font, size, space and radius. Tab indents, and Esc then Tab moves on.',
  feedback:
    'The feedback: lines, each on an event the game declares, saying words whose holes are its arguments, like {.item}; where matches some of them, and to is toast, log or both. Each beat is said by the first line that matches it. Tab indents, and Esc then Tab moves on.',
  shell:
    'The shell the game is played in: its title and tagline, how many slots (1 to 5), whether it has a Daily, and the slot-line each slot shows, with facts in braces like {time.day}. Every field may be left out. Tab indents, and Esc then Tab moves on.',
};

const NAMES: Readonly<Record<Exclude<Kind, 'screen'>, { heading: string; label: string }>> = {
  theme: { heading: 'Theme', label: 'The theme' },
  feedback: { heading: 'Feedback', label: 'The feedback' },
  shell: { heading: 'Shell', label: 'The shell' },
};

export function ScreenEditor({ project, path }: { project: OpenProject; path: string }) {
  const role = classifyUi(path);
  const kind: Kind = role.kind === 'theme' || role.kind === 'feedback' || role.kind === 'shell' ? role.kind : 'screen';
  const named = kind === 'screen' ? undefined : NAMES[kind];
  const title = role.kind === 'screen' ? role.id : kind;
  const [deleting, setDeleting] = useState(false);
  const canEdit = editing.access.value.kind === 'editing';
  // A screen and the theme are designed (M4.5); a problem's line opens the JSON at it (openUiFile).
  const designed = kind === 'screen' || kind === 'theme';
  const shown = designed ? uiView.value : 'json';
  return (
    <section class="script-editor" aria-label={named?.label ?? `Screen ${title}`}>
      <header class="record-head">
        <h3>{named?.heading ?? `Screen ${title}`}</h3>
        {canEdit ? (
          <div class="form-actions">
            <button type="button" class="button danger" onClick={() => setDeleting(true)}>
              Delete
            </button>
          </div>
        ) : null}
      </header>
      <p class="muted mono">{path}</p>
      {deleting ? <DeleteUiFile path={path} cancel={() => setDeleting(false)} /> : null}
      {designed ? (
        <fieldset class="form-actions designer-views">
          <legend class="visually-hidden">View</legend>
          <button
            type="button"
            class="button"
            aria-pressed={shown === 'design'}
            onClick={() => (uiView.value = 'design')}
          >
            Design
          </button>
          <button type="button" class="button" aria-pressed={shown === 'json'} onClick={() => (uiView.value = 'json')}>
            JSON
          </button>
        </fieldset>
      ) : null}
      {shown === 'design' && kind === 'screen' ? <ScreenDesigner project={project} path={path} id={title} /> : null}
      {shown === 'design' && kind === 'theme' ? <ThemeDesigner project={project} /> : null}
      {shown === 'json' ? <JsonView project={project} path={path} kind={kind} /> : null}
    </section>
  );
}

/** The file's JSON in CodeMirror, its problems each a way to its line. */
function JsonView({ project, path, kind }: { project: OpenProject; path: string; kind: Kind }) {
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
  const ready = loaded?.kind === 'ok';
  const go = (line: number, column?: number) => code.current?.focusAt(line, column);
  return (
    <>
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
    </>
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
