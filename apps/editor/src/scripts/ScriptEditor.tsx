/**
 * A script in the inspector (M3.2, D38): its text in CodeMirror, and its problems, each a way to
 * its line. Typing is an edit like a form's: it joins the undo history in steps, as typing in one
 * field does, and the editor's undo takes it back. Loaded when a script is first opened, with
 * CodeMirror, which is more than the editor's start should carry (Readings).
 */

import type { Diagnostic } from '@eb/schema';
import { scriptPath } from '@eb/script';
import { effect } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { chosen } from '../forms/selection.ts';
import { type OpenProject, revision } from '../projects/opened.ts';
import { type CodeEditor, codeEditor } from './codeEditor.ts';
import { lineToFocus } from './open.ts';
import { deleteScript, setScriptText } from './scriptEdits.ts';
import '../styles/scripts.css';

type Loaded =
  | { readonly kind: 'missing' }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'ok'; readonly text: string };

const utf8 = new TextDecoder('utf-8', { fatal: true });

function decode(bytes: Uint8Array | undefined): Loaded {
  if (bytes === undefined) return { kind: 'missing' };
  try {
    return { kind: 'ok', text: utf8.decode(bytes) };
  } catch {
    return { kind: 'unreadable' };
  }
}

export function ScriptEditor({ project, id }: { project: OpenProject; id: string }) {
  const path = scriptPath(id);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [deleting, setDeleting] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const code = useRef<CodeEditor | null>(null);
  const canEdit = editing.access.value.kind === 'editing';
  const problems = useMemo(() => project.game.problems.filter((p) => p.file === path), [project.game, path]);

  // Read on every change, straight into CodeMirror rather than through a render, so no keystroke
  // falls between an undo and the editor showing it.
  useEffect(() => {
    let live = true;
    const stop = effect(() => {
      void revision.value;
      void editing.access.value;
      void project.source.read(path).then((bytes) => {
        if (!live) return;
        const read = decode(bytes);
        if (read.kind === 'ok') code.current?.sync(read.text);
        setLoaded(read);
      });
    });
    return () => {
      live = false;
      stop();
    };
  }, [project.source, path]);

  const ready = loaded?.kind === 'ok';
  useEffect(() => {
    if (!ready || code.current || !host.current || loaded?.kind !== 'ok') return;
    code.current = codeEditor(host.current, {
      text: loaded.text,
      readOnly: !canEdit,
      label: path,
      type: (text) => editing.edit(`Edit ${path}`, (copy) => setScriptText(copy, id, text), `script:${id}`),
    });
  }, [ready]);
  useEffect(() => () => code.current?.destroy(), []);
  useEffect(() => code.current?.setReadOnly(!canEdit), [canEdit, ready]);
  useEffect(() => code.current?.setProblems(problems), [problems, ready]);
  useEffect(() => {
    const focus = lineToFocus.value;
    if (!ready || focus?.id !== id) return;
    lineToFocus.value = null;
    code.current?.focusAt(focus.line, focus.column);
  }, [ready, lineToFocus.value]);

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
          <ScriptProblems problems={problems} go={(line, column) => code.current?.focusAt(line, column)} />
        </>
      ) : null}
    </section>
  );
}

function ScriptProblems({
  problems,
  go,
}: {
  problems: readonly Diagnostic[];
  go: (line: number, column?: number) => void;
}) {
  if (problems.length === 0) return <p class="muted">No problems.</p>;
  return (
    <ul class="script-problems" aria-label="Problems in this script">
      {problems.map((p, i) => (
        // Keyed by place: two problems can share a code and a line.
        <li key={i} class={p.severity === 'error' ? 'logic-problem' : 'logic-warning'}>
          {p.line !== undefined ? (
            <button type="button" class="button" onClick={() => go(p.line as number, p.column)}>
              {`Line ${p.line}`}
            </button>
          ) : null}
          <span>{`${p.code}: ${p.message}`}</span>
        </li>
      ))}
    </ul>
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
