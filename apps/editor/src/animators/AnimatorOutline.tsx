/**
 * An animator's layer as an outline (M6.5, D77, docs/specs/animation.md#the-editor), as a behaviour's
 * Do is drawn (M6.3): a row a state with the transitions it leaves by under it, numbered in the
 * order they are read, each a button that chooses it, marked with its problems; a bar of actions on
 * the chosen row, each one step of undo and a single tap; and the chosen row's form below. The upper
 * body is added and taken away whole.
 */
import { ANIMATOR_TYPE_FILE, ANY, type FieldDef } from '@eb/schema';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { pointerOf, useForm } from '../forms/formContext.ts';
import type { OpenProject } from '../projects/opened.ts';
import { AnimRowForm, clipsOf, rowFields } from './AnimRowForm.tsx';
import {
  type AnimRow,
  addState,
  addTransition,
  canMove,
  canRemove,
  type Edited,
  type LayerName,
  moveRow,
  removeRow,
  rowsOf,
  stateIds,
  UPPER_START,
} from './outline.ts';
import '../styles/behaviours.css';

type Group = Extract<FieldDef, { kind: 'group' }>;
const LAYER_DEFS = ANIMATOR_TYPE_FILE.fields as Readonly<Record<LayerName, Group>>;

interface Props {
  readonly project: OpenProject;
  readonly layer: LayerName;
  /** The animator's own clips model. */
  readonly clips: unknown;
  readonly value: unknown;
}

export function AnimatorOutline({ project, layer, clips, value }: Props) {
  const form = useForm();
  const heading = useUniqueId();
  const def = LAYER_DEFS[layer];
  const [chosen, setChosen] = useState('');
  if (value === undefined)
    return (
      <section class="behaviour-outline" data-at={`/${layer}`} aria-labelledby={heading}>
        <h4 id={heading} class="behaviour-heading">
          {def.label}
        </h4>
        <p class="form-help">{def.description}. Left out, the whole body plays alone.</p>
        <div class="form-actions">
          <button
            type="button"
            class="button"
            disabled={!form.canEdit}
            onClick={() => form.update([layer], () => UPPER_START, 'Add upper body')}
          >
            Add upper body
          </button>
        </div>
      </section>
    );
  const rows = rowsOf(value, layer);
  const row = rows.find((r) => pointerOf(r.path) === chosen) ?? (rows[0] as AnimRow | undefined);
  // The row to choose is worked out on the layer shown, which is the one the edit lands on.
  const apply = (said: string, make: (now: unknown) => Edited) => {
    setChosen(pointerOf(make(value).path));
    form.update([layer], (now) => make(now).layer, said);
  };
  const ids = stateIds(value);
  const start = (def.fields.start ?? { kind: 'text' }) as FieldDef;
  return (
    <section class="behaviour-outline" data-at={`/${layer}`} aria-labelledby={heading}>
      <h4 id={heading} class="behaviour-heading">
        {def.label}
      </h4>
      <p class="form-help">
        {def.description}. Each frame the transitions from the state playing are read in their order, then those from
        any state: the first that holds goes.
      </p>
      {[`/${layer}`, `/${layer}/states`, `/${layer}/transitions`].flatMap((at) =>
        form.problemsAt(at).map((problem) => (
          <p key={`${at}${problem.code}${problem.message}`} class="field-problem">
            {problem.message}
          </p>
        )),
      )}
      <FieldView
        label="Starts in"
        def={{ kind: 'enum', values: ids }}
        info={start}
        path={[layer, 'start']}
        value={(value as { start?: unknown }).start}
      />
      <ul class="behaviour-rows" aria-label={`${def.label} states and transitions`}>
        {rows.map((r) => {
          const at = pointerOf(r.path);
          const count = rowFields(r).reduce(
            (n, field) => n + form.problemsAt(pointerOf([...r.path, field])).length,
            form.problemsAt(at).length,
          );
          return (
            <li key={at} class="behaviour-row" style={{ paddingInlineStart: `${r.depth * 0.9}rem` }}>
              <button
                type="button"
                class="behaviour-pick"
                aria-current={row && at === pointerOf(row.path) ? 'true' : undefined}
                onClick={() => setChosen(at)}
              >
                <span>{r.text}</span>
                {count > 0 ? (
                  <span class="behaviour-marks">{count === 1 ? '1 problem' : `${count} problems`}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <LayerBar layer={layer} value={value} row={row} clips={clipsOf(project, clips)} apply={apply} />
      {row ? (
        <AnimRowForm key={pointerOf(row.path)} project={project} layer={layer} clips={clips} value={value} row={row} />
      ) : null}
    </section>
  );
}

interface BarProps {
  readonly layer: LayerName;
  readonly value: unknown;
  readonly row: AnimRow | undefined;
  readonly clips: readonly string[] | undefined;
  readonly apply: (said: string, make: (now: unknown) => Edited) => void;
}

/** Where a transition added on the row leaves from: the state chosen, or the one the chosen transition is under. */
function fromOf(value: unknown, row: AnimRow | undefined, ids: readonly string[]): string {
  if (row?.kind === 'state') return ids[row.index] ?? ANY;
  const left = row
    ? (value as { transitions?: readonly { from?: unknown }[] }).transitions?.[row.index]?.from
    : undefined;
  return typeof left === 'string' ? left : (ids[0] ?? ANY);
}

function LayerBar({ layer, value, row, clips, apply }: BarProps) {
  const form = useForm();
  const ids = stateIds(value);
  const from = fromOf(value, row, ids);
  const after = row?.kind === 'state' ? row.index : ids.length - 1;
  const act = (label: string, can: boolean, make: (now: unknown) => Edited) => (
    <button type="button" class="button" disabled={!form.canEdit || !can} onClick={() => apply(label, make)}>
      {label}
    </button>
  );
  // A new whole-body state plays the model's first clip; an upper one gives way until one is chosen.
  const clip = layer === 'base' ? clips?.[0] : undefined;
  return (
    <fieldset class="behaviour-bar">
      <legend class="visually-hidden">Change the states and transitions</legend>
      <div class="form-actions">
        {act('Add state', true, (now) => addState(now, layer, after, clip))}
        {act('Add transition', ids.length > 0, (now) => addTransition(now, layer, from))}
      </div>
      <div class="form-actions">
        {act('Up', row !== undefined && canMove(value, row, -1), (now) => moveRow(now, layer, row as AnimRow, -1))}
        {act('Down', row !== undefined && canMove(value, row, 1), (now) => moveRow(now, layer, row as AnimRow, 1))}
        {act('Remove', row !== undefined && canRemove(value, row), (now) => removeRow(now, layer, row as AnimRow))}
        {layer === 'upper' ? (
          <button
            type="button"
            class="button danger"
            disabled={!form.canEdit}
            onClick={() => form.update(['upper'], () => undefined, 'Remove upper body')}
          >
            Remove upper body
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}
