/**
 * project.json's calendar (M3.5, D43), which the time kit reads: a form like a record's, drawn
 * from the calendar's fields (calendarFile.ts), each change a step that undo takes back. Its
 * problems are project.json's, which the catalog reads again after every change. A calendar left
 * out reads as an empty one, a day a tick, so its first field typed in adds it.
 */
import { MANIFEST_FILE } from '@eb/compiler';
import { useMemo } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { calendarChange } from '../editing/projectEdits.ts';
import { WrongShape } from '../forms/FieldShell.tsx';
import { FieldView } from '../forms/FieldView.tsx';
import { type FormApi, FormContext, pointerOf } from '../forms/formContext.ts';
import { labelOf } from '../forms/labels.ts';
import { fieldPointers, routeProblems } from '../forms/problems.ts';
import { useFile } from '../forms/useFile.ts';
import { getIn, setIn } from '../forms/values.ts';
import type { OpenProject } from '../projects/opened.ts';
import { CALENDAR_FILE, calendarProblems } from './calendarFile.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function ProjectCalendar({ project }: { project: OpenProject }) {
  const loaded = useFile(project, MANIFEST_FILE);
  if (loaded?.kind !== 'ok' || !isObject(loaded.value)) return null;
  return <CalendarForm project={project} value={loaded.value.calendar} />;
}

function CalendarForm({ project, value }: { project: OpenProject; value: unknown }) {
  const { catalog } = project;
  const canEdit = editing.access.value.kind === 'editing';
  const routed = useMemo(
    () => routeProblems(calendarProblems(catalog.problems), fieldPointers(CALENDAR_FILE, value)),
    [catalog.problems, value],
  );
  const change = (said: string, make: (calendar: unknown) => unknown, group?: string) =>
    void editing.edit(said, (copy) => calendarChange(copy, make), group);
  const api: FormApi = {
    canEdit,
    catalog,
    typeFile: CALENDAR_FILE,
    id: 'calendar',
    problemsAt: (pointer) => routed.get(pointer) ?? [],
    set: (path, next, label) =>
      change(
        `Edit ${label} in the calendar`,
        (now) => setIn(now, path, next, CALENDAR_FILE),
        `${MANIFEST_FILE}#/calendar${pointerOf(path)}`,
      ),
    update: (path, make, said) =>
      change(`${said} in the calendar`, (now) => setIn(now, path, make(getIn(now, path)), CALENDAR_FILE)),
  };
  const whole = routed.get('') ?? [];
  return (
    <FormContext.Provider value={api}>
      <fieldset class="project-calendar" data-at="/calendar">
        <legend>Calendar</legend>
        <p class="muted">
          How the time kit counts days, weeks, months, seasons and years. Rows can run as each one starts.
        </p>
        {whole.map((problem) => (
          <p key={`${problem.code}${problem.message}`} class="field-problem">
            {problem.message}
          </p>
        ))}
        {value === undefined || isObject(value) ? (
          Object.entries(CALENDAR_FILE.fields).map(([name, def]) => (
            <FieldView
              key={name}
              label={labelOf(name, def)}
              def={def}
              info={def}
              path={[name]}
              value={isObject(value) ? value[name] : undefined}
            />
          ))
        ) : (
          <WrongShape
            value={value}
            what="calendar"
            canEdit={canEdit}
            replace={() => api.set([], undefined, 'calendar')}
          />
        )}
      </fieldset>
    </FormContext.Provider>
  );
}
