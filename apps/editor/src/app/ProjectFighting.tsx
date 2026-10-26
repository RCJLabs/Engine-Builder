/**
 * project.json's fighting (M6.4, D76), which the fighting kit reads: the player's actor and the
 * combat record a hit reads, as pickers like a record's, each change a step that undo takes back.
 * Its problems are E082: its shape the catalog's, and what it names the index's, read again after
 * every change. Left out, it reads as empty, so the first pick adds it.
 */
import { MANIFEST_FILE } from '@eb/compiler';
import { useMemo } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { fightingChange } from '../editing/projectEdits.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { type FormApi, FormContext, pointerOf } from '../forms/formContext.ts';
import { labelOf } from '../forms/labels.ts';
import { fieldPointers, routeProblems } from '../forms/problems.ts';
import { useFile } from '../forms/useFile.ts';
import { getIn, setIn } from '../forms/values.ts';
import type { OpenProject } from '../projects/opened.ts';
import { FIGHTING_FILE, fightingProblems } from './fightingFile.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function ProjectFighting({ project }: { project: OpenProject }) {
  const loaded = useFile(project, MANIFEST_FILE);
  const { catalog, index } = project;
  const value = loaded?.kind === 'ok' && isObject(loaded.value) ? loaded.value.fighting : undefined;
  const routed = useMemo(
    () =>
      routeProblems(
        fightingProblems([...catalog.problems, ...(index?.spaces ?? [])]),
        fieldPointers(FIGHTING_FILE, value),
      ),
    [catalog.problems, index?.spaces, value],
  );
  if (loaded?.kind !== 'ok' || !isObject(loaded.value)) return null;
  const api: FormApi = {
    canEdit: editing.access.value.kind === 'editing',
    catalog,
    typeFile: FIGHTING_FILE,
    id: 'fighting',
    problemsAt: (pointer) => routed.get(pointer) ?? [],
    set: (path, next, label) =>
      void editing.edit(
        `Set the ${label.toLowerCase()} for fighting`,
        (copy) => fightingChange(copy, (now) => setIn(now, path, next, FIGHTING_FILE)),
        `${MANIFEST_FILE}#/fighting${pointerOf(path)}`,
      ),
    update: (path, make, said) =>
      void editing.edit(said, (copy) =>
        fightingChange(copy, (now) => setIn(now, path, make(getIn(now, path)), FIGHTING_FILE)),
      ),
  };
  return (
    <FormContext.Provider value={api}>
      <fieldset class="project-calendar" data-at="/fighting">
        <legend>Fighting</legend>
        <p class="muted">Who the player is in a fight, and which stats a blow reads.</p>
        {(routed.get('') ?? []).map((problem) => (
          <p key={`${problem.code}${problem.message}`} class="field-problem">
            {problem.message}
          </p>
        ))}
        {Object.entries(FIGHTING_FILE.fields).map(([name, def]) => (
          <FieldView
            key={name}
            label={labelOf(name, def)}
            def={def}
            info={def}
            path={[name]}
            value={isObject(value) ? value[name] : undefined}
          />
        ))}
      </fieldset>
    </FormContext.Provider>
  );
}
