/**
 * The chosen step's form (M6.3, D75, docs/specs/ai.md#the-editor): its kind, changed with a button
 * so an arrow key in the select never throws a step's nodes away (a list keeps its nodes, a point
 * its point), the problems at the node itself, and its fields as nodeFields gives them, each at its
 * place in the record. A guard's hours are a pair of whole numbers, drawn here.
 */
import { kindOf, type NodeKind } from '@eb/kits';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { FieldShell } from '../forms/FieldShell.tsx';
import { FieldView } from '../forms/FieldView.tsx';
import { pointerOf, useForm } from '../forms/formContext.ts';
import { labelOf } from '../forms/labels.ts';
import type { Path } from '../forms/values.ts';
import { type NodeSettings, nodeFields } from './nodeFields.ts';
import { KIND_WORDS } from './nodeWords.ts';
import { asKind, type OutlineRow, type Start } from './outline.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const KINDS = Object.keys(KIND_WORDS) as NodeKind[];

interface Props {
  readonly row: OutlineRow;
  readonly settings: NodeSettings;
  readonly start: Start;
  /** Writes `make(node)` in the node's place, as one step that says `said`. */
  readonly change: (said: string, make: (node: unknown) => unknown) => void;
}

export function NodeForm({ row, settings, start, change }: Props) {
  const form = useForm();
  const pointer = pointerOf(row.at);
  const node = isObject(row.node) ? row.node : {};
  const problems = form.problemsAt(pointer);
  return (
    <fieldset class="form-group behaviour-node" data-at={pointer}>
      <legend class="form-legend">{row.path === '' ? 'The whole of Do' : 'This step'}</legend>
      {problems.map((problem) => (
        <p key={`${problem.code}${problem.message}`} class="field-problem">
          {problem.message}
        </p>
      ))}
      <KindPick key={row.path} row={row} start={start} change={change} />
      {row.kind === 'guard' ? <HoursField path={[...row.at, 'hours']} value={node.hours} /> : null}
      {row.kind
        ? Object.entries(nodeFields(row.kind, settings)).map(([name, def]) => (
            <FieldView
              key={name}
              label={labelOf(name, def)}
              def={def}
              info={def}
              path={[...row.at, name]}
              value={node[name]}
            />
          ))
        : null}
    </fieldset>
  );
}

function KindPick({ row, start, change }: Pick<Props, 'row' | 'start' | 'change'>) {
  const form = useForm();
  const id = useUniqueId();
  const [kind, setKind] = useState<NodeKind>(row.kind ?? 'wait');
  const now = kindOf(row.node);
  return (
    <div class="form-actions behaviour-kind">
      <FieldShell id={id} label="Kind" info={{}} shown={[]}>
        <select
          id={id}
          class="field form-select"
          value={kind}
          disabled={!form.canEdit}
          onChange={(event) => setKind(event.currentTarget.value as NodeKind)}
        >
          {KINDS.map((each) => (
            <option key={each} value={each}>
              {KIND_WORDS[each]}
            </option>
          ))}
        </select>
      </FieldShell>
      <button
        type="button"
        class="button"
        disabled={!form.canEdit || kind === now}
        onClick={() => change(`Make it ${KIND_WORDS[kind].toLowerCase()}`, (n) => asKind(n, kind, start))}
      >
        {now === undefined ? 'Use this' : 'Change kind'}
      </button>
    </div>
  );
}

/** From and to, in the calendar's hours: left out, the guard holds at every hour. */
function HoursField({ path, value }: { path: Path; value: unknown }) {
  const form = useForm();
  const hours = Array.isArray(value) ? value : undefined;
  const problems = form.problemsAt(pointerOf(path));
  return (
    <fieldset class="form-group" data-at={pointerOf(path)}>
      <legend class="form-legend">
        Hours<span class="form-optional"> (optional)</span>
      </legend>
      {problems.map((problem) => (
        <p key={`${problem.code}${problem.message}`} class="field-problem">
          {problem.message}
        </p>
      ))}
      {hours ? (
        <>
          <FieldView
            label="From hour"
            def={{ kind: 'int', min: 0 }}
            info={{ description: 'It holds from the start of this hour' }}
            path={[...path, 0]}
            value={hours[0]}
          />
          <FieldView
            label="To hour"
            def={{ kind: 'int', min: 0 }}
            info={{ description: 'Up to the start of this one. Before From, it runs past midnight.' }}
            path={[...path, 1]}
            value={hours[1]}
          />
        </>
      ) : null}
      <div class="form-actions">
        <button
          type="button"
          class="button"
          disabled={!form.canEdit}
          onClick={() => form.set(path, hours ? undefined : [8, 17], 'Hours')}
        >
          {hours ? 'Remove hours' : 'Add hours'}
        </button>
      </div>
    </fieldset>
  );
}
