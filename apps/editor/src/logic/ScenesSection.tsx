/**
 * The Logic panel's scenes (M3.11, D49): each ink scene under scenes/, opening in the inspector,
 * with its problems counted, and New scene, which writes one that compiles as it stands. Scenes
 * are talks, so they need the dialogue kit.
 */
import { scenePath } from '@eb/compiler';
import { formatRef } from '@eb/core';
import { DIALOGUE, TALK } from '@eb/kits';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { openScene } from '../scenes/open.ts';
import { sceneTemplate } from '../scenes/templates.ts';
import { createTextFiles } from '../scripts/scriptEdits.ts';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function newScene(id: string, typed: string): void {
  void editing
    .edit(`New scene ${id}`, (copy) => createTextFiles(copy, [[scenePath(id), sceneTemplate(typed)]]))
    .then(() => openScene(id));
}

export function ScenesSection({ project }: { project: OpenProject }) {
  const { catalog, index } = project;
  const heading = useUniqueId();
  const [naming, setNaming] = useState(false);
  const canEdit = editing.access.value.kind === 'editing';
  const on = catalog.kits.includes(DIALOGUE);
  const ids = [...catalog.scenes].sort();
  const problemsOf = (id: string) => index?.records.get(formatRef(TALK, id))?.problems.length ?? 0;
  return (
    <section class="logic-section" aria-labelledby={heading}>
      <div class="logic-head">
        <h3 id={heading}>Scenes</h3>
        {canEdit && on ? (
          <button type="button" class="button" onClick={() => setNaming(true)}>
            New scene
          </button>
        ) : null}
      </div>
      {naming ? (
        <NameRecord
          type="scene"
          // A scene is a talk: its id can't be a talk record's either.
          ids={catalog.records.get(TALK) ?? []}
          label="Name of the new scene"
          action="Create"
          fileOf={scenePath}
          done={(id, typed) => {
            setNaming(false);
            newScene(id, typed);
          }}
          cancel={() => setNaming(false)}
        />
      ) : null}
      {!on ? (
        <p class="muted">Turn the Dialogue kit on in the Project panel to write scenes in ink: each becomes a talk.</p>
      ) : ids.length === 0 ? (
        <p class="muted">
          No scenes yet. A scene is a talk written in ink, as Inky writes it: lines, choices, and where each leads.
        </p>
      ) : (
        <ul class="logic-list">
          {ids.map((id) => (
            <li key={id}>
              <button type="button" class="logic-card" onClick={() => openScene(id)}>
                <span class="logic-title">{`${id}.ink`}</span>
                <span class="muted">{problemsOf(id) > 0 ? count(problemsOf(id), 'problem') : 'No problems'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
