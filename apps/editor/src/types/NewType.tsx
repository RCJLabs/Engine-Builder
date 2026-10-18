import { isEngineType, kitOf } from '@eb/schema';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { Catalog } from '../forms/catalog.ts';
import { slugify } from '../forms/labels.ts';
import { chosen } from '../forms/selection.ts';
import type { OpenProject } from '../projects/opened.ts';
import { createType } from './typeActions.ts';

/** Whether the type is one the project has already: its own, the engine's or a kit's. */
const isTaken = (catalog: Catalog, type: string) => catalog.types.has(type) || catalog.broken.has(type);

/** Why the name typed can't be a new type's, or null when it can (or nothing is typed yet). */
export function newTypeProblem(typed: string, catalog: Catalog): string | null {
  const type = slugify(typed);
  const kit = kitOf(type, catalog.kits);
  if (typed.trim() === '') return null;
  if (type === '') return 'Use letters or digits';
  if (isEngineType(type)) return `${type} is one of the engine’s own types`;
  if (kit !== undefined) return `${type} is the ${kit} kit’s type: Edit type adds fields to it`;
  return isTaken(catalog, type) ? `There is a type ${type} already` : null;
}

/**
 * Naming a new type (M2.6): what is typed is its title, and makes its name ("Chariot Team" is
 * chariot-team), its file's name. A type file there already can't be made again. Records already
 * in records/<name>/ with no type file become the new type's.
 */
export function NewType({ project }: { project: OpenProject }) {
  const { catalog } = project;
  const [typed, setTyped] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const id = useUniqueId();
  useLayoutEffect(() => box.current?.focus(), []);
  const canEdit = editing.access.value.kind === 'editing';
  const type = slugify(typed);
  const taken = isTaken(catalog, type);
  const waiting = catalog.records.get(type)?.length ?? 0;
  const problem = newTypeProblem(typed, catalog);
  const said =
    type === ''
      ? 'Lowercase words joined by hyphens make its name.'
      : `Saved as types/${type}.json${waiting > 0 ? `; the ${waiting === 1 ? 'record' : `${waiting} records`} in records/${type}/ become its own` : ''}.`;
  return (
    <form
      class="new-type"
      aria-label="New type"
      onSubmit={(event) => {
        event.preventDefault();
        if (type !== '' && !taken) void createType(type, typed.trim());
      }}
    >
      <h3>New type</h3>
      <p class="muted">
        A type is a kind of record: players, gladiators, cards. Its fields are what each record holds.
      </p>
      <label for={id}>Name of the new type</label>
      <input
        ref={box}
        id={id}
        class="field"
        value={typed}
        autoComplete="off"
        disabled={!canEdit}
        aria-describedby={`${id}-said`}
        aria-invalid={problem ? 'true' : undefined}
        onInput={(event) => setTyped(event.currentTarget.value)}
      />
      <p id={`${id}-said`} class={problem ? 'field-problem' : 'form-help'}>
        {problem ?? said}
      </p>
      <div class="form-actions">
        <button type="submit" class="button primary" disabled={!canEdit || type === '' || taken}>
          Create type
        </button>
        <button type="button" class="button" onClick={() => (chosen.value = null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
