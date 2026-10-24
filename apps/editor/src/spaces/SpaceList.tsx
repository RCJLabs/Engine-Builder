/**
 * The Scene panel's list (M5.1, docs/specs/viewport.md#the-scene-panel): the project's spaces and
 * prefabs, each opening in the view, with New space and New prefab naming a file as New does in the
 * Records panel; and its own component kinds (M5.2), each opening in the type designer.
 */
import { componentPath, type SpaceKind, spacePath } from '@eb/compiler';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { step } from '../editing/step.ts';
import type { SpaceEntry } from '../forms/catalog.ts';
import { humanize } from '../forms/labels.ts';
import type { OpenProject } from '../projects/opened.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { designKind } from '../types/open.ts';
import { createSpace } from './actions.ts';
import { createKindFile } from './kindEdits.ts';
import { openSpaceFile } from './state.ts';

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const WORDS: Record<SpaceKind, { title: string; one: string; none: string }> = {
  space: {
    title: 'Spaces',
    one: 'space',
    none: 'No spaces yet. A space is one place in a 3D world: a yard, a valley, the inside of a hut.',
  },
  prefab: {
    title: 'Prefabs',
    one: 'prefab',
    none: 'No prefabs yet. A prefab is a group of objects that spaces place, each placement the same: a crate, a stall, a tree.',
  },
};

export function SpaceList({ project }: { project: OpenProject }) {
  return (
    <div class="logic-browser">
      <Section project={project} kind="space" entries={project.catalog.spaces} />
      <Section project={project} kind="prefab" entries={project.catalog.prefabs} />
      <Kinds project={project} />
    </div>
  );
}

function Section({
  project,
  kind,
  entries,
}: {
  project: OpenProject;
  kind: SpaceKind;
  entries: readonly SpaceEntry[];
}) {
  const [naming, setNaming] = useState(false);
  const heading = useUniqueId();
  const words = WORDS[kind];
  const canEdit = editing.access.value.kind === 'editing';
  const problems = (id: string) => project.catalog.problems.filter((p) => p.file === spacePath(kind, id)).length;
  return (
    <section class="logic-section" aria-labelledby={heading}>
      <div class="logic-head">
        <h3 id={heading}>{words.title}</h3>
        {canEdit ? (
          <button type="button" class="button" onClick={() => setNaming(true)}>
            New {words.one}
          </button>
        ) : null}
      </div>
      {naming ? (
        <NameRecord
          type={kind}
          ids={entries.map((entry) => entry.id)}
          label={`Name of the new ${words.one}`}
          action="Create"
          fileOf={(id) => spacePath(kind, id)}
          done={(id, typed) => {
            setNaming(false);
            void createSpace(kind, id, typed);
          }}
          cancel={() => setNaming(false)}
        />
      ) : null}
      {entries.length === 0 ? (
        <p class="muted">{words.none}</p>
      ) : (
        <ul class="logic-list">
          {entries.map((entry) => {
            const found = problems(entry.id);
            return (
              <li key={entry.id}>
                <button type="button" class="logic-card" onClick={() => openSpaceFile(kind, entry.id)}>
                  <span class="logic-title">{entry.name ? `${entry.name} (${entry.id})` : entry.id}</span>
                  {entry.objects !== undefined ? <span class="muted">{count(entry.objects, 'object')}</span> : null}
                  {found > 0 ? <span class="logic-problems">{count(found, 'problem')}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The project's own component kinds (M5.2, D64): New names one, and each opens in the type designer. */
function Kinds({ project }: { project: OpenProject }) {
  const [naming, setNaming] = useState(false);
  const heading = useUniqueId();
  const { componentFiles, components } = project.catalog;
  const canEdit = editing.access.value.kind === 'editing';
  const problems = (id: string) => project.catalog.problems.filter((p) => p.file === componentPath(id)).length;
  return (
    <section class="logic-section" aria-labelledby={heading}>
      <div class="logic-head">
        <h3 id={heading}>Component kinds</h3>
        {canEdit ? (
          <button type="button" class="button" onClick={() => setNaming(true)}>
            New component kind
          </button>
        ) : null}
      </div>
      {naming ? (
        <NameRecord
          type="component kind"
          // The engine's kinds' ids are taken too.
          ids={[...components.keys(), ...componentFiles]}
          label="Name of the new component kind"
          action="Create"
          fileOf={componentPath}
          done={(id, typed) => {
            setNaming(false);
            const title = typed.trim() || humanize(id);
            void step(`New component kind ${title}`, (copy) => createKindFile(copy, id, title)).then((made) => {
              if (made) designKind(id);
            });
          }}
          cancel={() => setNaming(false)}
        />
      ) : null}
      {componentFiles.length === 0 ? (
        <p class="muted">
          None of the project’s own yet: the engine’s light, collider, trigger zone, spawn point and sound are there to
          add. A kind of your own is a set of fields, as a record type is: a loot spot, a climbing hold.
        </p>
      ) : (
        <ul class="logic-list">
          {componentFiles.map((id) => {
            const found = problems(id);
            const title = components.get(id)?.file.title;
            return (
              <li key={id}>
                <button type="button" class="logic-card" onClick={() => designKind(id)}>
                  <span class="logic-title">{title ? `${title} (${id})` : id}</span>
                  {found > 0 ? <span class="logic-problems">{count(found, 'problem')}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
