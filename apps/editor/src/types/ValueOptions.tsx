import { pointerSegment } from '@eb/core';
import { ASSET_KINDS, type FieldKind, type ValueDef } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { FormContext } from '../forms/formContext.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { type DefPath, isObject, kindOf, nodeAt, valuesAt } from './defPaths.ts';
import { designForm, useDesign } from './designContext.ts';
import { FieldList } from './FieldList.tsx';
import { kindChange, setChange } from './fieldEdits.ts';
import { KIND_NAMES, KINDS } from './kinds.ts';
import { RefTargets } from './RefTargets.tsx';
import { Problems } from './TypeDesigner.tsx';

const pointer = (path: DefPath) => path.map((key) => `/${pointerSegment(key)}`).join('');

/** The texts the type's records hold at `path`, each once, in order: the choices a choice field starts with. */
function heldTexts(records: readonly { value: unknown }[], json: unknown, path: DefPath): string[] {
  const found = new Set<string>();
  for (const { value } of records) {
    for (const held of valuesAt(json, path, value)) if (typeof held === 'string' && held !== '') found.add(held);
  }
  return [...found].sort();
}

/**
 * The kind of the def at `path`, as a list to pick another from. Picking one is a step that
 * converts nothing (type-files.md): the records keep their values, and those that don't fit show
 * their problems. A choice starts from the texts the records hold there.
 */
export function KindSelect({ path, label, field }: { path: DefPath; label: string; field: boolean }) {
  const design = useDesign();
  const id = useUniqueId();
  const kind = kindOf(nodeAt(design.json, path));
  const problems = design.problemsAt(`${pointer(path)}/kind`);
  return (
    <div class="form-field">
      <label for={id} class="form-label">
        Kind
      </label>
      <select
        id={id}
        class="field form-select"
        value={kind ?? ''}
        disabled={!design.canEdit}
        aria-describedby={problems.length > 0 ? `${id}-problems` : undefined}
        onChange={(event) => {
          const next = event.currentTarget.value as FieldKind;
          const choices = next === 'enum' ? heldTexts(design.records, design.json, path) : [];
          const target = design.types.includes(design.type) ? design.type : (design.types[0] ?? design.type);
          void design.change(
            `Make ${label} ${KIND_NAMES[next].toLowerCase()}`,
            kindChange(path, next, field, choices, target),
          );
        }}
      >
        {kind === undefined ? <option value="">Not a kind the format knows</option> : null}
        {KINDS.map((each) => (
          <option key={each} value={each}>
            {KIND_NAMES[each]}
          </option>
        ))}
      </select>
      {problems.length > 0 ? (
        <div id={`${id}-problems`}>
          <Problems problems={problems} />
        </div>
      ) : null}
    </div>
  );
}

const number = (kind: 'int' | 'number', min?: number): ValueDef => (min === undefined ? { kind } : { kind, min });

/** A def's two bounds, each optional, as number boxes. */
function Bounds(props: { def: Record<string, unknown>; labels: [string, string]; of: ValueDef }) {
  const { def, labels, of } = props;
  return (
    <>
      <FieldView label={labels[0]} def={of} info={{ optional: true }} path={['min']} value={def.min} />
      <FieldView label={labels[1]} def={of} info={{ optional: true }} path={['max']} value={def.max} />
    </>
  );
}

/** What the def at `path` holds beyond its kind: bounds, choices, what it names, its items, its fields. */
export function ValueOptions({ path, label }: { path: DefPath; label: string }) {
  const design = useDesign();
  const node = nodeAt(design.json, path);
  const kind = kindOf(node);
  if (!kind || !isObject(node)) return null;
  const simple = (children: preact.ComponentChildren) => (
    <FormContext.Provider value={designForm(design, path, `${label} in type ${design.type}`)}>
      {children}
    </FormContext.Provider>
  );
  switch (kind) {
    case 'text':
      return simple(
        <>
          <Bounds def={node} labels={['Fewest characters', 'Most characters']} of={number('int', 0)} />
          <FieldView
            label="Several lines"
            def={{ kind: 'bool' }}
            info={{}}
            path={['multiline']}
            value={node.multiline}
          />
        </>,
      );
    case 'int':
    case 'number':
      return simple(<Bounds def={node} labels={['Smallest', 'Largest']} of={number(kind)} />);
    case 'enum':
      return <ChoiceList at={path} label={label} />;
    case 'ref':
      return <RefTargets at={path} label={label} />;
    case 'list':
      return (
        <>
          <ValueDefEditor path={[...path, 'of']} legend={`Each item of ${label}`} />
          {simple(<Bounds def={node} labels={['Fewest items', 'Most items']} of={number('int', 0)} />)}
        </>
      );
    case 'map':
      return (
        <>
          <MapKey path={path} label={label} />
          <ValueDefEditor path={[...path, 'of']} legend={`Each value of ${label}`} />
        </>
      );
    case 'group':
      return <FieldList group={path} label={label} />;
    case 'asset':
      return simple(
        <FieldView
          label="Kind of file"
          def={{ kind: 'enum', values: ASSET_KINDS }}
          info={{ optional: true, description: 'None takes any file in assets/' }}
          path={['of']}
          value={node.of}
        />,
      );
    default:
      return null;
  }
}

/** A list's items or a map's values: a def with no name, label or optional of its own. */
function ValueDefEditor({ path, legend }: { path: DefPath; legend: string }) {
  const design = useDesign();
  return (
    <fieldset class="value-def">
      <legend class="form-legend">{legend}</legend>
      <Problems problems={design.problemsAt(pointer(path))} />
      <KindSelect path={path} label={legend.toLowerCase()} field={false} />
      <ValueOptions path={path} label={legend.toLowerCase()} />
    </fieldset>
  );
}

const KEY_KINDS = [
  ['', 'Names'],
  ['enum', 'Choices'],
  ['ref', 'Records'],
] as const;

/** What a map's keys are: names, which follow the field-name rule, choices, or records' ids. */
function MapKey({ path, label }: { path: DefPath; label: string }) {
  const design = useDesign();
  const id = useUniqueId();
  const keyPath = [...path, 'key'];
  const kind = kindOf(nodeAt(design.json, keyPath)) ?? '';
  const keysHeld = () => {
    const found = new Set<string>();
    for (const { value } of design.records) {
      for (const map of valuesAt(design.json, path, value))
        if (isObject(map)) for (const key of Object.keys(map)) found.add(key);
    }
    return [...found].sort();
  };
  return (
    <>
      <div class="form-field">
        <label for={id} class="form-label">
          Keys
        </label>
        <select
          id={id}
          class="field form-select"
          value={kind}
          disabled={!design.canEdit}
          onChange={(event) => {
            const next = event.currentTarget.value;
            const target = design.types[0] ?? design.type;
            const key =
              next === 'enum'
                ? { kind: 'enum', values: keysHeld() }
                : next === 'ref'
                  ? { kind: 'ref', to: target }
                  : undefined;
            void design.change(
              `Key ${label} by ${next === '' ? 'names' : next === 'enum' ? 'choices' : 'records'}`,
              setChange(keyPath, key),
            );
          }}
        >
          {KEY_KINDS.map(([value, words]) => (
            <option key={value} value={value}>
              {words}
            </option>
          ))}
        </select>
      </div>
      {kind === 'enum' ? <ChoiceList at={keyPath} label={`the keys of ${label}`} /> : null}
      {kind === 'ref' ? <RefTargets at={keyPath} label={`the keys of ${label}`} /> : null}
    </>
  );
}
