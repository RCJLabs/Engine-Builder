/**
 * A terrain's foliage in the inspector (M5.6, D68, docs/specs/foliage.md#the-editor), under the
 * terrain's form: each type it lists with its record's name, Open and Remove, then Add foliage, a
 * picker of the project's foliage records it doesn't list yet and New from each preset. Plant,
 * Clear and Fill are in the terrain's row in the Scene panel.
 */
import { FOLIAGE_MOST, type TerrainJson } from '@eb/compiler';
import { FOLIAGE, FOLIAGE_PRESETS } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { openRecord } from '../records/actions.ts';
import { nameIn } from '../records/names.ts';
import type { LiveSpace } from '../spaces/live.ts';
import { addFoliageHere, newFoliageHere, removeFoliageHere } from './actions.ts';

export function FoliageSection(props: { project: OpenProject; terrain: TerrainJson; foliage: LiveSpace['foliage'] }) {
  const { project, terrain } = props;
  const canEdit = editing.access.value.kind === 'editing';
  const listed = terrain.foliage ?? [];
  const ids = project.catalog.records.get(FOLIAGE) ?? [];
  const file = project.catalog.types.get(FOLIAGE)?.file;
  const nameOf = (id: string) => nameIn(file, project.index?.records.get(`${FOLIAGE}:${id}`)?.value) ?? id;
  const free = ids.filter((id) => !listed.includes(id));
  return (
    <form class="object-form foliage-form" onSubmit={(event) => event.preventDefault()}>
      <h3>Foliage</h3>
      <p class="muted">
        Models scattered where they are painted with Plant in the terrain’s row, up to {FOLIAGE_MOST} kinds.
      </p>
      {listed.length > 0 ? (
        <ul class="foliage-list">
          {listed.map((id, k) => (
            <li key={id} class="foliage-item">
              <span class="foliage-name">{nameOf(id)}</span>
              {ids.includes(id) ? (
                <button type="button" class="button" onClick={() => openRecord(FOLIAGE, id)}>
                  Open {nameOf(id)}
                </button>
              ) : null}
              {canEdit ? (
                <button type="button" class="button" onClick={() => void removeFoliageHere(k, nameOf(id))}>
                  Remove {nameOf(id)}
                </button>
              ) : null}
              {props.foliage?.[k]?.record === null ? (
                <p class="field-problem">
                  {ids.includes(id)
                    ? `“${id}” has a problem, so nothing grows: open it to see what.`
                    : `There is no foliage record “${id}”.`}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit && listed.length < FOLIAGE_MOST ? <AddFoliage free={free} nameOf={nameOf} /> : null}
    </form>
  );
}

function AddFoliage({ free, nameOf }: { free: readonly string[]; nameOf: (id: string) => string }) {
  const addId = useUniqueId();
  const newId = useUniqueId();
  return (
    <>
      {free.length > 0 ? (
        <div class="form-field">
          <label for={addId}>Add foliage</label>
          <select
            id={addId}
            class="field form-select"
            value=""
            onChange={(event) => {
              const id = event.currentTarget.value;
              if (id) void addFoliageHere(id, nameOf(id));
            }}
          >
            <option value="">A foliage record…</option>
            {free.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div class="form-field">
        <label for={newId}>New foliage from</label>
        <select
          id={newId}
          class="field form-select"
          value=""
          onChange={(event) => {
            const preset = FOLIAGE_PRESETS.find((p) => p.id === event.currentTarget.value);
            if (preset) void newFoliageHere(preset);
          }}
        >
          <option value="">A preset…</option>
          {FOLIAGE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
