/**
 * A script in the inspector (M3.2, D38): its text in CodeMirror, and its problems, each a way to
 * its line. Typing is an edit like a form's: it joins the undo history in steps, as typing in one
 * field does, and the editor's undo takes it back. Loaded when a script is first opened, with
 * CodeMirror, which is more than the editor's start should carry (Readings). A stage file (M7.4)
 * opens here too, offering `"eb/stage"`'s names rather than the engine's.
 */

import { scriptPath, stagePath } from '@eb/script';
import { useMemo, useRef, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { chosen } from '../forms/selection.ts';
import type { OpenProject } from '../projects/opened.ts';
import { type CodeEditor, stageLanguage } from './codeEditor.ts';
import { CodeProblems, useCode, useTextFile } from './codeFile.tsx';
import { projectNames } from './known.ts';
import { lineToFocus, stageKey } from './open.ts';
import { deleteScript, deleteStage, setScriptText, setStageText } from './scriptEdits.ts';
import '../styles/scripts.css';

export function ScriptEditor({ project, id, stage = false }: { project: OpenProject; id: string; stage?: boolean }) {
  const path = stage ? stagePath(id) : scriptPath(id);
  const what = stage ? 'Stage' : 'Script';
  const [deleting, setDeleting] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  // One editor for both hooks: the file's reads go into the CodeMirror useCode makes.
  const code = useRef<CodeEditor | null>(null);
  const problems = useMemo(() => project.game.problems.filter((p) => p.file === path), [project.game, path]);
  const loaded = useTextFile(project, path, code);
  const setText = stage ? setStageText : setScriptText;
  const setup = {
    id: stage ? stageKey(id) : id,
    path,
    type: (text: string) =>
      editing.edit(`Edit ${path}`, (copy) => setText(copy, id, text), stage ? path : `script:${id}`),
    focus: lineToFocus,
    ...(stage ? { language: stageLanguage() } : { names: projectNames }),
  };
  useCode(host, code, loaded, setup, problems);
  const canEdit = editing.access.value.kind === 'editing';
  const ready = loaded?.kind === 'ok';
  return (
    <section class="script-editor" aria-label={`${what} ${id}.ts`}>
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
      {deleting ? <DeleteScript id={id} stage={stage} cancel={() => setDeleting(false)} /> : null}
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
            {stage
              ? 'Ctrl+Space offers the stage’s API; Tab indents, and Esc then Tab moves on. A stage imports "eb/stage" and files under stages/ ("./name"), nothing else, and draws each frame on the canvas it is given.'
              : 'Ctrl+Space offers the engine’s API; Tab indents, and Esc then Tab moves on. Scripts import "eb" and each other ("./name"), nothing else.'}
          </p>
          <CodeProblems
            problems={problems}
            go={(line, column) => code.current?.focusAt(line, column)}
            label={stage ? 'Problems in this stage' : 'Problems in this script'}
          />
        </>
      ) : null}
    </section>
  );
}

/** Deleting asks first; scripts (or stages) that import it show a problem until they don't. */
function DeleteScript({ id, stage, cancel }: { id: string; stage: boolean; cancel: () => void }) {
  const path = stage ? stagePath(id) : scriptPath(id);
  const others = stage ? 'Stages and spaces that name it' : 'Scripts that import it';
  return (
    <div class="confirm">
      <p>{`Delete ${path}? ${others} will show a problem until they don’t. Undo brings it back.`}</p>
      <div class="form-actions">
        <button
          type="button"
          class="button danger"
          onClick={() => {
            chosen.value = null;
            void editing.edit(`Delete ${path}`, (copy) => (stage ? deleteStage : deleteScript)(copy, id));
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
