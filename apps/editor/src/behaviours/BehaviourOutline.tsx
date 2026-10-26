/**
 * A behaviour's Do as an outline (M6.3, D75, docs/specs/ai.md#the-editor): a row a step, each a
 * button that chooses it, marked with its problems; a bar of actions on the chosen step (Add, Up,
 * Down, Wrap, Unwrap, Remove), each one step of undo and each a single tap, so nothing needs a drag;
 * and the chosen step's form below. The points its fields offer are the objects of the spaces its
 * actors stand in. A graph editor waits for Phase 8.
 */
import { calendarOf, formatRef, parseRef } from '@eb/core';
import { ACTOR, BEHAVIOUR, FIGHTING, type NodeKind } from '@eb/kits';
import { useMemo, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { useForm } from '../forms/formContext.ts';
import { walkersNow } from '../logic/WalkToFields.tsx';
import type { OpenProject } from '../projects/opened.ts';
import { NodeForm } from './NodeForm.tsx';
import { type NodeSettings, rowPointers } from './nodeFields.ts';
import { KIND_WORDS, kindsFor, nodeText } from './nodeWords.ts';
import {
  addAfter,
  addInside,
  canRemove,
  canUnwrap,
  changeAt,
  LISTS,
  moveAt,
  newNode,
  type OutlineRow,
  removeAt,
  rowsOf,
  type Start,
  startUnit,
  unwrapAt,
  type Wrap,
  wrapAt,
} from './outline.ts';
import '../styles/behaviours.css';

/** The calendar's units and weekdays, and the objects of the spaces where this behaviour's actors stand. */
export function settingsFor(project: OpenProject, id: string): NodeSettings {
  const calendar = project.catalog.calendar;
  let units = ['ticks', 'days'];
  try {
    units = Object.keys(calendarOf(calendar ?? { ticksPerDay: 1 }).units);
  } catch {
    // A calendar that won't read is E038's: lengths fall back to ticks and days.
  }
  const walkers = walkersNow();
  const actors = (project.index?.usedBy.get(formatRef(BEHAVIOUR, id)) ?? [])
    .map((usage) => parseRef(usage.from))
    .flatMap((ref) => (ref?.type === ACTOR ? [ref.id] : []));
  const points = new Set(
    actors.flatMap((actor) => [...(walkers.get(actor)?.objects ?? [])].filter((p) => p !== actor)),
  );
  return {
    units,
    ...(calendar?.weekdays ? { weekdays: calendar.weekdays } : {}),
    points: [...points].sort(),
    kinds: kindsFor(project.catalog.kits.includes(FIGHTING)),
  };
}

type Apply = (said: string, make: (tree: unknown) => { root: unknown; path: string }) => void;

const WRAPS: readonly Wrap[] = ['guard', 'first', 'in-order'];

export function BehaviourOutline({ project, id, value }: { project: OpenProject; id: string; value: unknown }) {
  const form = useForm();
  const heading = useUniqueId();
  const settings = useMemo(() => settingsFor(project, id), [project, id]);
  const rows = rowsOf(value);
  const [chosen, setChosen] = useState('');
  const row = rows.find((r) => r.path === chosen) ?? (rows[0] as OutlineRow);
  const start: Start = { unit: startUnit(settings.units), point: settings.points[0] ?? '' };
  // The path to choose is worked out on the tree shown, which is the one the edit lands on.
  const apply: Apply = (said, make) => {
    setChosen(make(value).path);
    form.update(['do'], (tree) => make(tree).root, said);
  };
  return (
    <section class="behaviour-outline" data-at="/do" aria-labelledby={heading}>
      <h4 id={heading} class="behaviour-heading">
        Do
      </h4>
      <p class="form-help">
        Run after every event. The first that holds takes the first of its steps that holds; In order runs its steps one
        after another; Only when holds while its hours, days and If allow.
      </p>
      <ul class="behaviour-rows" aria-label="Steps">
        {rows.map((r) => {
          const count = rowPointers(r, settings).reduce((n, p) => n + form.problemsAt(p).length, 0);
          return (
            <li key={r.path} class="behaviour-row" style={{ paddingInlineStart: `${r.depth * 0.9}rem` }}>
              <button
                type="button"
                class="behaviour-pick"
                aria-current={r.path === row.path ? 'true' : undefined}
                onClick={() => setChosen(r.path)}
              >
                <span>{nodeText(r.node)}</span>
                {count > 0 ? (
                  <span class="behaviour-marks">{count === 1 ? '1 problem' : `${count} problems`}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <OutlineBar tree={value} row={row} start={start} apply={apply} kinds={settings.kinds ?? kindsFor(false)} />
      <NodeForm
        row={row}
        settings={settings}
        start={start}
        change={(said, make) => apply(said, (tree) => ({ root: changeAt(tree, row.path, make), path: row.path }))}
      />
    </section>
  );
}

interface BarProps {
  readonly tree: unknown;
  readonly row: OutlineRow;
  readonly start: Start;
  readonly apply: Apply;
  readonly kinds: readonly NodeKind[];
}

function OutlineBar({ tree, row, start, apply, kinds }: BarProps) {
  const form = useForm();
  const addId = useUniqueId();
  const wrapId = useUniqueId();
  const [kind, setKind] = useState<NodeKind>('wait');
  const [wrapAs, setWrapAs] = useState<Wrap>('guard');
  const inside = row.kind !== undefined && LISTS.has(row.kind);
  const add = inside ? 'Add inside' : row.inList ? 'Add after' : null;
  const act = (label: string, can: boolean, make: (t: unknown) => { root: unknown; path: string }) => (
    <button type="button" class="button" disabled={!form.canEdit || !can} onClick={() => apply(label, make)}>
      {label}
    </button>
  );
  const word = KIND_WORDS[kind].toLowerCase();
  return (
    <fieldset class="behaviour-bar">
      <legend class="visually-hidden">Change the steps</legend>
      <div class="form-actions">
        <label for={addId}>Add</label>
        <select
          id={addId}
          class="field form-select"
          value={kind}
          onChange={(e) => setKind(e.currentTarget.value as NodeKind)}
        >
          {kinds.map((each) => (
            <option key={each} value={each}>
              {KIND_WORDS[each]}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="button primary"
          disabled={!form.canEdit || add === null}
          onClick={() =>
            apply(`Add ${word}`, (t) =>
              inside ? addInside(t, row.path, newNode(kind, start)) : addAfter(t, row.path, newNode(kind, start)),
            )
          }
        >
          {add ?? 'Add'}
        </button>
      </div>
      <div class="form-actions">
        {act('Up', row.inList && row.index > 0, (t) => moveAt(t, row.path, -1))}
        {act('Down', row.inList && row.index < row.siblings - 1, (t) => moveAt(t, row.path, 1))}
        {act('Unwrap', canUnwrap(tree, row.path), (t) => ({ root: unwrapAt(t, row.path), path: row.path }))}
        {act('Remove', canRemove(tree, row.path), (t) => removeAt(t, row.path))}
      </div>
      <div class="form-actions">
        <label for={wrapId}>Wrap in</label>
        <select
          id={wrapId}
          class="field form-select"
          value={wrapAs}
          onChange={(e) => setWrapAs(e.currentTarget.value as Wrap)}
        >
          {WRAPS.map((each) => (
            <option key={each} value={each}>
              {KIND_WORDS[each]}
            </option>
          ))}
        </select>
        {act('Wrap', row.kind !== undefined, (t) => ({ root: wrapAt(t, row.path, wrapAs), path: row.path }))}
      </div>
    </fieldset>
  );
}
