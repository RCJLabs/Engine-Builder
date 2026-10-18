import type { Diagnostic } from '@eb/schema';
import { signal } from '@preact/signals';
import { useMemo, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import type { OpenProject } from '../projects/opened.ts';
import '../styles/problems.css';
import { projectProblems } from './collect.ts';
import { openPlace } from './open.ts';
import {
  ALL_PROBLEMS,
  groupProblems,
  type ProblemGroup,
  type ProblemView,
  placeOf,
  shownGroups,
  whereOf,
} from './problemList.ts';

/** Problems drawn at first and added by each "Show more": a page a phone draws quickly. */
const PAGE = 200;

/** The view kept while the panel is away, as the other panels keep theirs. */
const view = signal<ProblemView>(ALL_PROBLEMS);

const SEVERITIES: readonly [ProblemView['severity'], string][] = [
  ['all', 'Errors and warnings'],
  ['error', 'Errors'],
  ['warning', 'Warnings'],
];

/** The Problems panel's body: its tools, then each file's problems, each a way to where it is fixed. */
export function ProblemBrowser({ project }: { project: OpenProject }) {
  const search = useUniqueId();
  const severity = useUniqueId();
  const [limit, setLimit] = useState(PAGE);
  const { catalog, index, game } = project;
  const groups = useMemo(
    () => groupProblems(projectProblems(catalog, index, game), catalog, index),
    [catalog, index, game],
  );
  const now = view.value;
  const shown = useMemo(() => shownGroups(groups, now, catalog), [groups, now, catalog]);
  const set = (next: Partial<ProblemView>) => {
    view.value = { ...now, ...next };
    setLimit(PAGE);
  };
  const total = groups.reduce((sum, group) => sum + group.problems.length, 0);
  const count = shown.reduce((sum, group) => sum + group.problems.length, 0);
  return (
    <div class="problem-browser">
      {index === null ? <p class="muted">Checking the records…</p> : null}
      {total === 0 ? (
        index === null ? null : (
          <p class="muted">No problems in the project’s files: `eb validate` would pass them.</p>
        )
      ) : (
        <>
          <div class="problem-tools">
            <label class="visually-hidden" for={search}>
              Search problems
            </label>
            <input
              id={search}
              class="field problem-search"
              type="search"
              placeholder="Search messages, codes, files"
              value={now.search}
              onInput={(event) => set({ search: event.currentTarget.value })}
            />
            <label class="visually-hidden" for={severity}>
              Show
            </label>
            <select
              id={severity}
              class="field"
              value={now.severity}
              onChange={(event) => set({ severity: event.currentTarget.value as ProblemView['severity'] })}
            >
              {SEVERITIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <p class="muted problem-count">{count === total ? `${total} in all` : `${count} of ${total}`}</p>
          <Groups project={project} groups={shown} limit={limit} />
          {count > limit ? (
            <div class="form-actions">
              <button type="button" class="button" onClick={() => setLimit(limit + PAGE)}>
                Show {Math.min(PAGE, count - limit)} more
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** The groups, cut off after `limit` problems in all. */
function Groups({ project, groups, limit }: { project: OpenProject; groups: readonly ProblemGroup[]; limit: number }) {
  let left = limit;
  const drawn: ProblemGroup[] = [];
  for (const group of groups) {
    if (left <= 0) break;
    drawn.push({ ...group, problems: group.problems.slice(0, left) });
    left -= group.problems.length;
  }
  return (
    <ul class="problem-groups">
      {drawn.map((group) => (
        <Group key={group.file} project={project} group={group} />
      ))}
    </ul>
  );
}

function Group({ project, group }: { project: OpenProject; group: ProblemGroup }) {
  return (
    <li class="problem-group">
      <h3>
        {group.title}
        {group.title !== group.file ? <span class="muted mono"> {group.file}</span> : null}
      </h3>
      <ul class="problem-items">
        {group.problems.map((problem, i) => (
          <Problem key={`${problem.code} ${problem.path} ${i}`} project={project} problem={problem} />
        ))}
      </ul>
    </li>
  );
}

/** One problem: what and where, as a button to where it is fixed, or as words for a file the editor has no place for. */
function Problem({ project, problem }: { project: OpenProject; problem: Diagnostic }) {
  const place = placeOf(problem, project.catalog);
  const where = whereOf(problem, project.catalog);
  const said = (
    <>
      <span class={`problem-severity ${problem.severity}`}>{problem.severity === 'error' ? 'Error' : 'Warning'}</span>{' '}
      <span class="mono">{problem.code}</span> {problem.message}
      {where ? <span class="muted"> · {where}</span> : null}
    </>
  );
  return (
    <li>
      {place ? (
        <button type="button" class="problem-open" onClick={() => openPlace(place)}>
          {said}
        </button>
      ) : (
        <p class="problem-text">
          {said}
          <span class="muted"> · Move or delete it outside the editor.</span>
        </p>
      )}
    </li>
  );
}
