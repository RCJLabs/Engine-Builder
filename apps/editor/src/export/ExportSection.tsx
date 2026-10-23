/**
 * The Project panel's Export section (M4.10, D60): export.json as a form, each change a step that
 * undo takes back, and a button for each target. Exporting reads the project as it is saved: it
 * compiles the files, runs the game's scripts and makes the target here, in the browser.
 */
import { EXPORT_FILE } from '@eb/compiler';
import { EXPORT_TARGETS, type ExportTarget } from '@eb/export';
import { useMemo } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { WrongShape } from '../forms/FieldShell.tsx';
import { FieldView } from '../forms/FieldView.tsx';
import { type FormApi, FormContext, pointerOf } from '../forms/formContext.ts';
import { labelOf } from '../forms/labels.ts';
import { fieldPointers, routeProblems } from '../forms/problems.ts';
import { useFile } from '../forms/useFile.ts';
import { getIn, setIn } from '../forms/values.ts';
import type { OpenProject } from '../projects/opened.ts';
import { exportChange, exportFileProblems, exportTypeFile, STARTING_EXPORT } from './exportForm.ts';
import { exporting, exportReport, exportTo } from './exporting.ts';
import '../styles/export.css';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const BUTTONS: Record<ExportTarget, { label: string; note: string }> = {
  web: { label: 'Export web', note: 'A zip of the web build: put it on any web server.' },
  file: { label: 'Export file', note: 'One HTML file that plays from the device’s files.' },
  itch: { label: 'Export for itch.io', note: 'A zip to upload as an HTML game.' },
  repo: {
    label: 'Publish to GitHub',
    note: 'A zip of a repository, ready to push: the web build, its Pages workflow, and the Android app’s when there is one.',
  },
};

export function ExportSection({ project }: { project: OpenProject }) {
  const loaded = useFile(project, EXPORT_FILE);
  const canEdit = editing.access.value.kind === 'editing';
  const errors = (project.index?.exports ?? []).filter((d) => d.severity === 'error').length;
  return (
    <section class="project-export" aria-label="Export">
      <h4>Export</h4>
      <p class="muted">
        The game for the web, as one file, for itch.io, or as a repository for GitHub Pages and an Android app.
      </p>
      {loaded?.kind === 'ok' ? (
        <ExportForm project={project} value={loaded.value} />
      ) : loaded?.kind === 'unreadable' ? (
        <p class="field-problem">export.json isn’t JSON: {loaded.message}</p>
      ) : loaded?.kind === 'missing' ? (
        <div>
          <p class="muted">Without export.json, every target ships the full game with the project’s name.</p>
          <button
            type="button"
            class="button"
            disabled={!canEdit}
            onClick={() => void editing.edit('Set up export', (copy) => exportChange(copy, () => STARTING_EXPORT))}
          >
            Set up export
          </button>
        </div>
      ) : null}
      <div class="export-targets">
        {EXPORT_TARGETS.map((target) => (
          <div key={target} class="export-target">
            <button
              type="button"
              class={`button${target === 'repo' ? ' primary' : ''}`}
              disabled={exporting.value !== null || errors > 0}
              onClick={() => void exportTo(target)}
            >
              {exporting.value === target ? `${BUTTONS[target].label}…` : BUTTONS[target].label}
            </button>
            <p class="muted">{BUTTONS[target].note}</p>
          </div>
        ))}
      </div>
      {errors > 0 ? (
        <p class="field-problem">Fix export.json’s {errors === 1 ? 'problem' : 'problems'} to export.</p>
      ) : null}
      {exportReport.value ? (
        <div
          class={`export-report${exportReport.value.ok ? '' : ' export-failed'}`}
          role="status"
          aria-label="Export report"
        >
          {exportReport.value.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ExportForm({ project, value }: { project: OpenProject; value: unknown }) {
  const { catalog } = project;
  const canEdit = editing.access.value.kind === 'editing';
  const editions = isObject(value) && isObject(value.editions) ? Object.keys(value.editions) : [];
  const typeFile = useMemo(
    () =>
      exportTypeFile({
        editions: editions.filter((e) => e !== 'full'),
        types: catalog.recordTypes.map((t) => t.type).sort(),
        scenes: [...catalog.scenes].sort(),
      }),
    [editions.join(), catalog.recordTypes, catalog.scenes],
  );
  const routed = useMemo(
    () => routeProblems(exportFileProblems(project.index?.exports ?? []), fieldPointers(typeFile, value)),
    [project.index?.exports, typeFile, value],
  );
  const change = (said: string, make: (now: unknown) => unknown, group?: string) =>
    void editing.edit(said, (copy) => exportChange(copy, make), group);
  const api: FormApi = {
    canEdit,
    catalog,
    typeFile,
    id: 'export',
    problemsAt: (pointer) => routed.get(pointer) ?? [],
    set: (path, next, label) =>
      change(
        `Edit ${label} in export.json`,
        (now) => setIn(now, path, next, typeFile),
        `${EXPORT_FILE}#${pointerOf(path)}`,
      ),
    update: (path, make, said) =>
      change(`${said} in export.json`, (now) => setIn(now, path, make(getIn(now, path)), typeFile)),
  };
  const whole = routed.get('') ?? [];
  return (
    <FormContext.Provider value={api}>
      <div class="export-form" data-at="export.json">
        {whole.map((problem) => (
          <p key={`${problem.code}${problem.message}`} class="field-problem">
            {problem.message}
          </p>
        ))}
        {isObject(value) ? (
          Object.entries(typeFile.fields).map(([name, def]) => (
            <FieldView key={name} label={labelOf(name, def)} def={def} info={def} path={[name]} value={value[name]} />
          ))
        ) : (
          <WrongShape
            value={value}
            what="export.json"
            canEdit={canEdit}
            replace={() => api.set([], {}, 'export.json')}
          />
        )}
      </div>
    </FormContext.Provider>
  );
}
