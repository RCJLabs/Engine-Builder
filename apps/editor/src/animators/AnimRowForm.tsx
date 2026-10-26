/**
 * The chosen row's form in an animator's outline (M6.5, D77): a state's or a transition's fields, as
 * the type file gives them, at their places in the record. A state's clip is picked from its
 * model's clips, and a transition's ends from the layer's states; a state renamed takes the start and
 * its transitions with it, as one step.
 */
import { formatRef } from '@eb/core';
import { ANIMATOR_TYPE_FILE, ANY, type FieldDef, type FieldInfo, MODEL } from '@eb/schema';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { describedBy, FieldShell } from '../forms/FieldShell.tsx';
import { FieldView } from '../forms/FieldView.tsx';
import { pointerOf, useForm, useShownProblems } from '../forms/formContext.ts';
import { labelOf } from '../forms/labels.ts';
import type { OpenProject } from '../projects/opened.ts';
import { type AnimRow, type LayerName, renameState, stateIds } from './outline.ts';

type Group = Extract<FieldDef, { kind: 'group' }>;
type List = Extract<FieldDef, { kind: 'list' }>;

const itemFields = (layer: LayerName, list: 'states' | 'transitions') => {
  const group = ANIMATOR_TYPE_FILE.fields[layer] as Group;
  return ((group.fields[list] as List).of as Group).fields;
};

const STATE_FIELDS = Object.keys(itemFields('base', 'states'));
const TRANSITION_FIELDS = Object.keys(itemFields('base', 'transitions'));

/** The fields a row's problems sit at, below its own place. */
export const rowFields = (row: AnimRow): readonly string[] => (row.kind === 'state' ? STATE_FIELDS : TRANSITION_FIELDS);

/** The clips a model's record lists, or undefined when it lists none or isn't there. */
export function clipsOf(project: OpenProject, model: unknown): string[] | undefined {
  if (typeof model !== 'string') return undefined;
  const value = project.index?.records.get(formatRef(MODEL, model))?.value as { clips?: unknown } | undefined;
  if (!Array.isArray(value?.clips)) return undefined;
  return value.clips.flatMap((c: { name?: unknown }) => (typeof c?.name === 'string' ? [c.name] : []));
}

interface Props {
  readonly project: OpenProject;
  readonly layer: LayerName;
  readonly clips: unknown;
  readonly value: unknown;
  readonly row: AnimRow;
}

export function AnimRowForm({ project, layer, clips, value, row }: Props) {
  const form = useForm();
  const list = row.kind === 'state' ? 'states' : 'transitions';
  const items = (value as Record<string, unknown>)[list];
  const item = (Array.isArray(items) ? items[row.index] : undefined) as Record<string, unknown> | undefined;
  const fields = itemFields(layer, list);
  const pointer = pointerOf(row.path);
  const ids = stateIds(value);
  const field = (name: string, def?: FieldDef) => {
    const info = fields[name] as FieldDef;
    return (
      <FieldView
        key={name}
        label={labelOf(name, info)}
        def={def ?? info}
        info={info}
        path={[...row.path, name]}
        value={item?.[name]}
      />
    );
  };
  // A clip from the model it names, else the animator's; typed when the model lists no clips.
  const offered = clipsOf(project, item?.from ?? clips);
  return (
    <fieldset class="form-group behaviour-node" data-at={pointer}>
      <legend class="form-legend">{row.kind === 'state' ? 'This state' : 'This transition'}</legend>
      {form.problemsAt(pointer).map((problem) => (
        <p key={`${problem.code}${problem.message}`} class="field-problem">
          {problem.message}
        </p>
      ))}
      {row.kind === 'state' ? (
        <>
          <StateName layer={layer} index={row.index} value={item?.id} info={fields.id as FieldInfo} />
          {field('clip', offered ? { kind: 'enum', values: offered } : undefined)}
          {field('from')}
          {field('loop')}
          {field('rate')}
          {field('speed')}
        </>
      ) : (
        <>
          {field('from', { kind: 'enum', values: [ANY, ...ids] })}
          {field('to', { kind: 'enum', values: ids })}
          {field('when')}
          {field('blend')}
        </>
      )}
    </fieldset>
  );
}

/** A state's name, written when it is left, renaming it wherever the layer names it. */
function StateName({
  layer,
  index,
  value,
  info,
}: {
  layer: LayerName;
  index: number;
  value: unknown;
  info: FieldInfo;
}) {
  const form = useForm();
  const id = useUniqueId();
  const was = typeof value === 'string' ? value : '';
  const [typed, setTyped] = useState<string | null>(null);
  const path = [layer, 'states', index, 'id'];
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  return (
    <FieldShell id={id} label="State" info={info} shown={shown}>
      <input
        id={id}
        class="field form-input"
        value={typed ?? was}
        readOnly={!form.canEdit}
        spellcheck={false}
        autocapitalize="none"
        autoComplete="off"
        aria-invalid={shown.length > 0 ? 'true' : undefined}
        aria-describedby={describedBy(id, info, shown)}
        onFocus={onFocus}
        onInput={(event) => setTyped(event.currentTarget.value)}
        onBlur={() => {
          onBlur();
          const to = typed?.trim() ?? was;
          setTyped(null);
          if (to !== '' && to !== was)
            form.update([layer], (now) => renameState(now, index, to), `Rename ${was} to ${to}`);
        }}
      />
    </FieldShell>
  );
}
