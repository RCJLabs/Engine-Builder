/**
 * What the World panel lists (M4.6, D56, docs/specs/maps.md#the-editor): each map, layered or
 * drawn, and each kind of node, opening in the inspector, with New layered map, New drawn map and
 * New kind naming a record as New does in the Records panel. With the maps kit off, it says where
 * to turn it on.
 */
import { formatRef } from '@eb/core';
import { MAP, MAPS, NODE_KIND } from '@eb/kits';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { createRecord, createRecordFrom, openRecord } from '../records/actions.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { namesOf } from '../records/names.ts';
import { mapRow, newDrawnMap, newLayeredMap } from './worldList.ts';
import '../styles/logic.css';
import '../styles/world.css';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Naming = 'layered' | 'drawn' | 'kind' | null;

export function WorldBrowser({ project }: { project: OpenProject }) {
  if (!project.catalog.kits.includes(MAPS)) {
    return (
      <p class="muted">
        Maps come with the Maps kit. Tick Maps in the Project panel to make maps and the kinds of place on them.
      </p>
    );
  }
  return (
    <div class="logic-browser">
      <MapsSection project={project} />
      <KindsSection project={project} />
    </div>
  );
}

function problemsOf(project: OpenProject, type: string, id: string): number {
  return project.index?.records.get(formatRef(type, id))?.problems.length ?? 0;
}

function MapsSection({ project }: { project: OpenProject }) {
  const [naming, setNaming] = useState<Naming>(null);
  const heading = useUniqueId();
  const canEdit = editing.access.value.kind === 'editing';
  const maps = project.catalog.records.get(MAP) ?? [];
  const kinds = project.catalog.records.get(NODE_KIND) ?? [];
  const data = project.catalog.types.get(MAP);
  return (
    <section class="logic-section" aria-labelledby={heading}>
      <div class="logic-head">
        <h3 id={heading}>Maps</h3>
        {canEdit && data ? (
          <span class="world-actions">
            <button type="button" class="button" onClick={() => setNaming('layered')}>
              New layered map
            </button>
            <button type="button" class="button" onClick={() => setNaming('drawn')}>
              New drawn map
            </button>
          </span>
        ) : null}
      </div>
      {naming && data ? (
        <NameRecord
          type={MAP}
          ids={maps}
          label={`Name of the new ${naming} map`}
          action="Create"
          done={(id, typed) => {
            const value = naming === 'drawn' ? newDrawnMap(kinds) : newLayeredMap(kinds);
            setNaming(null);
            createRecordFrom(data, id, typed, value);
          }}
          cancel={() => setNaming(null)}
        />
      ) : null}
      {maps.length === 0 ? (
        <p class="muted">
          No maps yet. A layered map is made anew from a seed by its rules; a drawn map is placed by hand, with roads.
        </p>
      ) : (
        <ul class="logic-list">
          {maps.map((id) => {
            const row = mapRow(id, project.index?.records.get(formatRef(MAP, id))?.value);
            const problems = problemsOf(project, MAP, id);
            return (
              <li key={id}>
                <button type="button" class="logic-card" onClick={() => openRecord(MAP, id)}>
                  <span class="logic-title">{row.name ? `${row.name} (${id})` : id}</span>
                  <span class="muted">
                    {row.shape ? `${row.shape === 'layered' ? 'Layered' : 'Drawn'}: ${row.size}` : row.size}
                  </span>
                  {problems > 0 ? <span class="logic-problems">{count(problems, 'problem')}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function KindsSection({ project }: { project: OpenProject }) {
  const [naming, setNaming] = useState(false);
  const heading = useUniqueId();
  const canEdit = editing.access.value.kind === 'editing';
  const kinds = project.catalog.records.get(NODE_KIND) ?? [];
  const data = project.catalog.types.get(NODE_KIND);
  const names = namesOf(project.index, project.catalog);
  return (
    <section class="logic-section" aria-labelledby={heading}>
      <div class="logic-head">
        <h3 id={heading}>Kinds of place</h3>
        {canEdit && data ? (
          <button type="button" class="button" onClick={() => setNaming(true)}>
            New kind
          </button>
        ) : null}
      </div>
      {naming && data ? (
        <NameRecord
          type={NODE_KIND}
          ids={kinds}
          label="Name of the new kind"
          action="Create"
          done={(id, typed) => {
            setNaming(false);
            createRecord(data, id, typed);
          }}
          cancel={() => setNaming(false)}
        />
      ) : null}
      {kinds.length === 0 ? (
        <p class="muted">No kinds yet. A kind is what a place on a map is: a station, a camp, a crag.</p>
      ) : (
        <ul class="logic-list">
          {kinds.map((id) => {
            const name = names(formatRef(NODE_KIND, id));
            const problems = problemsOf(project, NODE_KIND, id);
            return (
              <li key={id}>
                <button type="button" class="logic-card" onClick={() => openRecord(NODE_KIND, id)}>
                  <span class="logic-title">{name ? `${name} (${id})` : id}</span>
                  {problems > 0 ? <span class="logic-problems">{count(problems, 'problem')}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
