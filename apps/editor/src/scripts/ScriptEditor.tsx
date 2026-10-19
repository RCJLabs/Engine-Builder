/**
 * A script in the inspector (M3.2, D38): its text in CodeMirror, and its problems, each a way to
 * its line. Typing is an edit like a form's: it joins the undo history in steps, as typing in one
 * field does, and the editor's undo takes it back. Loaded when a script is first opened, with
 * CodeMirror, which is more than the editor's start should carry (Readings).
 */

import { scriptPath } from '@eb/script';
import { useMemo, useRef, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { chosen } from '../forms/selection.ts';
import type { OpenProject } from '../projects/opened.ts';
import type { CodeEditor } from './codeEditor.ts';
import { CodeProblems, useCode, useTextFile } from './codeFile.tsx';
import { projectNames } from './known.ts';
import { lineToFocus } from './open.ts';
import { deleteScript, setScriptText } from './scriptEdits.ts';
import '../styles/scripts.css';

export function ScriptEditor({ project, id }: { project: OpenProject; id: string }) {
  const path = scriptPath(id);
  const [deleting, setDeleting] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  // One editor for both hooks: the file's reads go into the CodeMirror useCode makes.
  const code = useRef<CodeEditor | null>(null);
  const problems = useMemo(() => project.game.problems.filter((p) => p.file === path), [project.game, path]);
  const loaded = useTextFile(project, path, code);
  const setup = {
    id,
    path,
    type: (text: string) => editing.edit(`Edit ${path}`, (copy) => setScriptText(copy, id, text), `script:${id}`),
    focus: lineToFocus,
    names: projectNames,
  };
  useCode(host, code, loaded, setup, problems);
  const canEdit = editing.access.value.kind === 'editing';
  const ready = loaded?.kind === 'ok';
  return (
    <section class="script-editor" aria-label={`Script ${id}.ts`}>
      <header class="record-head">
        <h3>{`${id}.ts`}</h3>
        {canEdit && loaded?.kind !== 'missing' ? (
          <div class="form-actions">
            <button type="button" class="button danger" onClick={() => setDeleting(true)}>
              Delete
            </button>
          </div>
        ) : null}
      </header>
      <p class="muted mono">{path}</p>
      {deleting ? <DeleteScript id={id} cancel={() => setDeleting(false)} /> : null}
      {loaded === null ? <p class="muted">Reading {path}…</p> : null}
      {loaded?.kind === 'missing' ? <p class="muted">{path} isn’t there any more. Undo brings it back.</p> : null}
      {loaded?.kind === 'unreadable' ? (
        <p class="logic-problem">{path} isn’t UTF-8 text, so it can’t be edited here.</p>
      ) : null}
      {/* Kept through a script deleted and brought back, so CodeMirror always has its place. */}
      <div ref={host} class="script-code" data-project-field hidden={!ready} />
      {ready ? (
        <>
          <p class="form-help">
            Ctrl+Space offers the engine’s API; Tab indents, and Esc then Tab moves on. Scripts import "eb" and each
            other ("./name"), nothing else.
          </p>
          <CodeProblems
            problems={problems}
            go={(line, column) => code.current?.focusAt(line, column)}
            label="Problems in this script"
          />
        </>
      ) : null}
    </section>
  );
}

/** Deleting asks first; scripts that import it show a problem until they don't. */
function DeleteScript({ id, cancel }: { id: string; cancel: () => void }) {
  const path = scriptPath(id);
  return (
    <div class="confirm">
      <p>{`Delete ${path}? Scripts that import it will show a problem until they don’t. Undo brings it back.`}</p>
      <div class="form-actions">
        <button
          type="button"
          class="button danger"
          onClick={() => {
            chosen.value = null;
            void editing.edit(`Delete ${path}`, (copy) => deleteScript(copy, id));
          }}
        >
          {`Delete ${id}.ts`}
        </button>
        <button type="button" class="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
