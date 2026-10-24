/**
 * The selected widget's form (M4.5, D55, docs/specs/designer.md#the-form): its kind's fields drawn
 * by the record form's own components; a button's action; a progress bar's value and most, each a
 * number or a fact in braces; a codex's record type and known; and shows-when. Layout fields change
 * every size, or with Only at set, the frame's breakpoint alone, in the widget's `at`.
 */
import type { FieldDef } from '@eb/schema';
import type { Breakpoint } from '@eb/ui/format';
import { useUniqueId } from '../app/ids.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { FormContext } from '../forms/formContext.ts';
import { parseNumber } from '../forms/values.ts';
import { ActionField } from './ActionField.tsx';
import { DraftInput } from './DraftInput.tsx';
import { changeUnder, formApi, type Part } from './formApi.ts';
import { editFile, onlyHere } from './state.ts';
import { isKind } from './tree.ts';
import { fieldsOf, LAYOUT_FIELDS, type LayoutField, OFFERED_FIELDS, RECORDS_FIELDS, typeFileOf } from './widgets.ts';

type Loose = Record<string, unknown>;
const HOLDS = ['children', 'item', 'unknown', 'tabs'];
const isLayout = (name: string): name is LayoutField => (LAYOUT_FIELDS as readonly string[]).includes(name);
const shown = (value: unknown) => (value === undefined ? 'not set' : JSON.stringify(value));

interface Props extends Omit<Part, 'typeFile'> {
  readonly widget: Loose;
  readonly breakpoint: Breakpoint;
  /** The game's actions and the project's screens, for a button's action. */
  readonly actions: readonly string[];
}

export function WidgetForm(props: Props) {
  const { widget, at, breakpoint } = props;
  const kind = widget.widget;
  if (!isKind(kind)) {
    return <p class="logic-problem">This isn’t one of the widgets the format has: change it in the JSON tab.</p>;
  }
  const api = formApi({ ...props, typeFile: typeFileOf(kind) });
  const here = onlyHere.value;
  const own = Object.entries(fieldsOf(kind));
  const layout = own.some(([name]) => isLayout(name));
  const field = ([name, own]: [string, FieldDef]) => {
    // A Space widget's space is one of the project's (M5.8): its picker lists them, the one set kept if it went.
    const def = kind === 'space' && name === 'space' ? spaceChoices(own, props, widget.space) : own;
    if (!(here && isLayout(name)))
      return <FieldView key={name} label={def.label ?? name} def={def} info={def} path={[name]} value={widget[name]} />;
    const value = ((widget.at as Loose | undefined)?.[breakpoint] as Loose | undefined)?.[name];
    const info = { optional: true, description: `At ${breakpoint} only. Every size: ${shown(widget[name])}.` };
    return (
      <FieldView
        key={name}
        label={`${def.label ?? name} at ${breakpoint}`}
        def={def}
        info={info}
        path={['at', breakpoint, name]}
        value={value}
      />
    );
  };
  return (
    <FormContext.Provider value={api}>
      <div class="designer-form" data-at={at}>
        <WidgetProblems
          {...props}
          rendered={[...own.map(([n]) => n), 'action', 'value', 'max', 'type', 'known', 'takes', 'shows-when']}
        />
        {layout ? (
          <SizesSwitch breakpoint={breakpoint} overrides={Object.keys((widget.at as Loose | undefined) ?? {})} />
        ) : null}
        {kind === 'progress' ? <Amounts {...props} /> : null}
        {own.map(field)}
        {kind === 'button' ? (
          <ActionField
            value={widget.action}
            actions={at.includes('/item') ? ['entry', ...props.actions] : props.actions}
            screens={props.project.catalog.screens}
            canEdit={props.canEdit}
            problems={props.problems.filter((p) => p.path === `${at}/action` || p.path.startsWith(`${at}/action/`))}
            write={(next, label, key) =>
              editFile(
                props.file,
                `Edit ${label} in ${props.title}`,
                changeUnder(at, ['action'], () => next),
                key && `${props.file}#${at}/action#${key}`,
              )
            }
          />
        ) : null}
        {kind === 'list' && widget.of === 'records' ? <RecordsFields {...props} /> : null}
        {kind === 'list' && widget.of === 'offered' ? (
          <FieldView
            label={OFFERED_FIELDS.takes?.label ?? 'Only these actions'}
            def={OFFERED_FIELDS.takes as FieldDef}
            info={OFFERED_FIELDS.takes as FieldDef}
            path={['takes']}
            value={widget.takes}
          />
        ) : null}
        <FieldView
          label="Shows when"
          def={typeFileOf(kind).fields['shows-when'] as FieldDef}
          info={typeFileOf(kind).fields['shows-when'] as FieldDef}
          path={['shows-when']}
          value={widget['shows-when']}
        />
      </div>
    </FormContext.Provider>
  );
}

function spaceChoices(own: FieldDef, props: Props, set: unknown): FieldDef {
  const ids = props.project.catalog.spaces.map((entry) => entry.id);
  const values = typeof set === 'string' && set !== '' && !ids.includes(set) ? [...ids, set] : ids;
  return values.length === 0
    ? own
    : { kind: 'enum', values, label: own.label ?? 'Space', description: own.description ?? '' };
}

/** Every size, or the frame's breakpoint alone, for the layout fields; and where this widget changes. */
function SizesSwitch({ breakpoint, overrides }: { breakpoint: Breakpoint; overrides: readonly string[] }) {
  const id = useUniqueId();
  return (
    <div class="form-field">
      <div class="form-bool">
        <input
          id={id}
          type="checkbox"
          class="form-check"
          checked={onlyHere.value}
          onChange={(event) => (onlyHere.value = event.currentTarget.checked)}
        />
        <label for={id} class="form-label">{`Change layout at ${breakpoint} only`}</label>
      </div>
      <p class="form-help">
        {overrides.length > 0
          ? `Its layout changes at ${overrides.join(', ')}.`
          : 'Its layout is the same at every size.'}
      </p>
    </div>
  );
}

/** A progress bar's value and most: a number, or a fact in braces like {time.day}. */
function Amounts(props: Props) {
  const id = useUniqueId();
  const amount = (name: 'value' | 'max', label: string) => {
    const value = props.widget[name];
    const problems = props.problems.filter((p) => p.path === `${props.at}/${name}`);
    return (
      <div class="form-field" key={name}>
        <label class="form-label" for={`${id}-${name}`}>
          {label}
        </label>
        <DraftInput
          id={`${id}-${name}`}
          stored={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
          canEdit={props.canEdit}
          invalid={problems.length > 0}
          write={(typed) =>
            editFile(
              props.file,
              `Edit ${label.toLowerCase()} in ${props.title}`,
              changeUnder(props.at, [name], () => parseNumber(typed) ?? typed),
              `${props.file}#${props.at}/${name}`,
            )
          }
        />
        <p class="form-help">A number, or a fact in braces like {'{time.day}'}.</p>
        {problems.map((p) => (
          <p key={p.message} class="field-problem">
            {p.message}
          </p>
        ))}
      </div>
    );
  };
  return (
    <>
      {amount('value', 'Value')}
      {amount('max', 'Most')}
    </>
  );
}

/** A codex's record type, from the project's, and its known. */
function RecordsFields({ widget, project }: Props) {
  const type: FieldDef = { kind: 'enum', values: project.catalog.names, label: 'Record type' };
  const known = RECORDS_FIELDS.known as FieldDef;
  return (
    <>
      <FieldView label="Record type" def={type} info={type} path={['type']} value={widget.type} />
      <FieldView label={known.label ?? 'Known when'} def={known} info={known} path={['known']} value={widget.known} />
    </>
  );
}

/** Problems of the widget the fields don't show: at the widget itself, or under a key no field draws. */
function WidgetProblems({ problems, at, rendered }: Props & { rendered: readonly string[] }) {
  const loose = problems.filter((p) => {
    if (p.path === at) return true;
    if (!p.path.startsWith(`${at}/`)) return false;
    const [first = '', second] = p.path.slice(at.length + 1).split('/');
    if (HOLDS.includes(first)) return false;
    if (first === 'at') return !(onlyHere.value && second !== undefined);
    return !rendered.includes(first);
  });
  if (loose.length === 0) return null;
  return (
    <div class="form-problems">
      {loose.map((p) => (
        <p key={`${p.code}${p.path}`} class="field-problem">{`${p.code}: ${p.message}`}</p>
      ))}
    </div>
  );
}
