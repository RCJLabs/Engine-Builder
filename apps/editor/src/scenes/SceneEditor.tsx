/**
 * An ink scene in the inspector (M3.11, D49): its text in CodeMirror with ink's colours, its
 * problems, each a way to its line, and the map of the talk it makes, each box opening the scene
 * at the line it came from. Typing is an edit like a script's, which the editor's undo takes
 * back. Loaded when a scene is first opened, with CodeMirror.
 */
import { scenePath } from '@eb/compiler';
import { formatRef } from '@eb/core';
import { lineAt } from '@eb/ink';
import { TALK } from '@eb/kits';
import { useMemo, useRef, useState } from 'preact/hooks';
import { TalkMap } from '../dialogue/TalkMap.tsx';
import { editing } from '../editing/current.ts';
import { chosen } from '../forms/selection.ts';
import type { OpenProject } from '../projects/opened.ts';
import { namesOf } from '../records/names.ts';
import type { IndexedRecord } from '../records/recordIndex.ts';
import type { CodeEditor } from '../scripts/codeEditor.ts';
import { CodeProblems, useCode, useTextFile } from '../scripts/codeFile.tsx';
import { deleteFile, setFileText } from '../scripts/scriptEdits.ts';
import { ink } from './inkLanguage.ts';
import { sceneLineToFocus } from './open.ts';
import '../styles/scripts.css';

export function SceneEditor({ project, id }: { project: OpenProject; id: string }) {
  const path = scenePath(id);
  const [deleting, setDeleting] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const code = useRef<CodeEditor | null>(null);
  const record = project.index?.records.get(formatRef(TALK, id));
  // A scene the index doesn't compile (the dialogue kit off, a talk record of its id) has the catalog's problems.
  const problems = useMemo(
    () => [...project.catalog.problems.filter((p) => p.file === path), ...(record?.problems ?? [])],
    [project.catalog, record, path],
  );
  const loaded = useTextFile(project, path, code);
  const setup = {
    id,
    path,
    type: (text: string) => editing.edit(`Edit ${path}`, (copy) => setFileText(copy, path, text), `scene:${id}`),
    focus: sceneLineToFocus,
    language: ink,
  };
  useCode(host, code, loaded, setup, problems);
  const canEdit = editing.access.value.kind === 'editing';
  const ready = loaded?.kind === 'ok';
  const go = (line: number, column?: number) => code.current?.focusAt(line, column);
  return (
    <section class="script-editor" aria-label={`Scene ${id}.ink`}>
      <header class="record-head">
        <h3>{`${id}.ink`}</h3>
        {canEdit && loaded?.kind !== 'missing' ? (
          <div class="form-actions">
            <button type="button" class="button danger" onClick={() => setDeleting(true)}>
              Delete
            </button>
          </div>
        ) : null}
      </header>
      <p class="muted mono">{path}</p>
      {deleting ? <DeleteScene id={id} cancel={() => setDeleting(false)} /> : null}
      {loaded === null ? <p class="muted">Reading {path}…</p> : null}
      {loaded?.kind === 'missing' ? <p class="muted">{path} isn’t there any more. Undo brings it back.</p> : null}
      {loaded?.kind === 'unreadable' ? (
        <p class="logic-problem">{path} isn’t UTF-8 text, so it can’t be edited here.</p>
      ) : null}
      <div ref={host} class="script-code" data-project-field hidden={!ready} />
      {ready ? (
        <>
          <p class="form-help">
            ink: knots (=== name ===), choices (* [what the player says]), gathers (-), diverts (-&gt; name), conditions
            on facts an EXTERNAL names, and tags: # speaker:, # fx:, # cost:, # needs:, # beat. Tab indents, and Esc
            then Tab moves on.
          </p>
          <CodeProblems problems={problems} go={go} label="Problems in this scene" />
          <SceneMap project={project} record={record} path={path} go={go} />
        </>
      ) : null}
    </section>
  );
}

/** The talk the scene makes, each box opening the scene at its line; none while the scene has errors. */
function SceneMap({
  project,
  record,
  path,
  go,
}: {
  project: OpenProject;
  record: IndexedRecord | undefined;
  path: string;
  go: (line: number) => void;
}) {
  const map = record?.scene?.map;
  if (record?.value === undefined || map === undefined) {
    return <p class="muted">The map shows the talk this scene makes once it has no errors.</p>;
  }
  return (
    <TalkMap
      value={record.value}
      file={path}
      names={namesOf(project.index, project.catalog)}
      open={(box) => {
        const line = lineAt(map, `/lines/${box.index}`);
        if (line !== undefined) go(line);
      }}
    />
  );
}

/** Deleting asks first; what opens its talk shows a problem until it doesn't. */
function DeleteScene({ id, cancel }: { id: string; cancel: () => void }) {
  const path = scenePath(id);
  return (
    <div class="confirm">
      <p>{`Delete ${path}? What opens its talk will show a problem until it doesn’t. Undo brings it back.`}</p>
      <div class="form-actions">
        <button
          type="button"
          class="button danger"
          onClick={() => {
            chosen.value = null;
            void editing.edit(`Delete ${path}`, (copy) => deleteFile(copy, path));
          }}
        >
          {`Delete ${id}.ink`}
        </button>
        <button type="button" class="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
