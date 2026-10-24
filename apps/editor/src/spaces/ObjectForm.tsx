/**
 * The inspector's form for the objects chosen in the Scene panel (M5.1,
 * docs/specs/viewport.md#the-inspector): one object's name, place, turn and scale, and its shape
 * and colour or its prefab; several, how many, with Group into prefab and Delete in the toolbar.
 * Typing into a field joins into one step of undo, as the record form's fields do.
 */
import { SHAPES } from '@eb/compiler';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { useDraft } from '../editing/draft.ts';
import { parseNumber } from '../forms/values.ts';
import type { OpenProject } from '../projects/opened.ts';
import { deleteChosen, placeChosen, setObject } from './actions.ts';
import type { Transform } from './gizmoMath.ts';
import { liveOf } from './live.ts';
import { GREY, nameOf, type SpaceJson, type SpaceObject, transformOf } from './spaceFile.ts';
import { openSpace, openSpaceFile, picked } from './state.ts';
import type { Vec3 } from './vec.ts';

export function ObjectForm(_props: { project: OpenProject }) {
  const open = openSpace.value;
  const now = liveOf(open);
  const ids = picked.value;
  if (!open) return <p class="muted">Open a space or a prefab in the Scene panel to edit its objects here.</p>;
  if (!now?.space) return <p class="muted">{now?.problem ?? `Opening ${open.path}…`}</p>;
  const objects = now.space.objects.filter((o) => ids.includes(o.id));
  if (objects.length === 0) {
    return <p class="muted">Choose an object in the view or the outliner to edit it here.</p>;
  }
  if (objects.length > 1) {
    return (
      <div class="object-form">
        <h3>{objects.length} objects</h3>
        <p class="muted">
          Move, turn or scale them together in the view, or group them into a prefab from the toolbar.
        </p>
        {editing.access.value.kind === 'editing' ? (
          <button type="button" class="button" onClick={() => void deleteChosen()}>
            Delete {objects.length} objects
          </button>
        ) : null}
      </div>
    );
  }
  const [object] = objects as [SpaceObject];
  return <OneObject key={`${open.path}#${object.id}`} object={object} prefabs={now.prefabs} />;
}

function OneObject({ object, prefabs }: { object: SpaceObject; prefabs: ReadonlyMap<string, SpaceJson> }) {
  const canEdit = editing.access.value.kind === 'editing';
  const t = transformOf(object);
  const place = (next: Transform, what: string) =>
    void placeChosen(
      new Map([[object.id, next]]),
      `${what} ${object.id}`,
      `${openSpace.value?.path}#${object.id}#${what}`,
    );
  const nameId = useUniqueId();
  const shapeId = useUniqueId();
  const colorId = useUniqueId();
  return (
    <form class="object-form" onSubmit={(event) => event.preventDefault()}>
      <h3>
        {nameOf(object)}
        {object.name !== undefined ? <span class="muted"> ({object.id})</span> : null}
      </h3>
      <div class="form-field">
        <label for={nameId}>Name</label>
        <TextBox
          id={nameId}
          value={object.name ?? ''}
          canEdit={canEdit}
          write={(name) =>
            void setObject(
              object.id,
              { name: name.trim() === '' ? undefined : name.slice(0, 80) },
              `Rename ${object.id}`,
            )
          }
        />
      </div>
      <Triple legend="Place, in metres" value={t.at} canEdit={canEdit} write={(at) => place({ ...t, at }, 'Move')} />
      <Triple
        legend="Turn, in degrees"
        value={t.turn}
        canEdit={canEdit}
        write={(turn) => place({ ...t, turn }, 'Turn')}
      />
      <Triple
        legend="Scale"
        value={t.scale}
        canEdit={canEdit}
        above={0}
        write={(scale) => place({ ...t, scale }, 'Scale')}
      />
      {object.shape !== undefined ? (
        <>
          <div class="form-field">
            <label for={shapeId}>Shape</label>
            <select
              id={shapeId}
              class="field"
              value={object.shape}
              disabled={!canEdit}
              onChange={(event) =>
                void setObject(
                  object.id,
                  { shape: event.currentTarget.value as SpaceObject['shape'] },
                  `Shape of ${object.id}`,
                )
              }
            >
              {SHAPES.map((shape) => (
                <option key={shape} value={shape}>
                  {shape}
                </option>
              ))}
            </select>
          </div>
          <div class="form-field">
            <label for={colorId}>Colour</label>
            <input
              id={colorId}
              class="field object-color"
              type="color"
              value={object.color ?? GREY}
              disabled={!canEdit}
              onInput={(event) =>
                void setObject(object.id, { color: event.currentTarget.value }, `Colour of ${object.id}`)
              }
            />
          </div>
        </>
      ) : (
        <div class="form-field">
          <p>
            Places the prefab <strong>{prefabs.get(object.prefab ?? '')?.name ?? object.prefab}</strong>
            {prefabs.has(object.prefab ?? '') ? null : ', which prefabs/ doesn’t have'}.
          </p>
          {object.prefab !== undefined && prefabs.has(object.prefab) ? (
            <button type="button" class="button" onClick={() => openSpaceFile('prefab', object.prefab as string)}>
              Open prefab
            </button>
          ) : null}
        </div>
      )}
    </form>
  );
}

function TextBox(props: { id: string; value: string; canEdit: boolean; write: (text: string) => void }) {
  const draft = useDraft(props.value);
  return (
    <input
      id={props.id}
      class="field form-input"
      value={draft.shown}
      maxLength={80}
      autoComplete="off"
      readOnly={!props.canEdit}
      data-project-field
      onInput={(event) => {
        draft.setDraft(event.currentTarget.value);
        props.write(event.currentTarget.value);
      }}
      onBlur={draft.clear}
    />
  );
}

const AXES = ['x', 'y', 'z'] as const;

/** Three numbers: a place, a turn or a scale. What isn't a number yet stays in its box until it is. */
function Triple(props: {
  legend: string;
  value: Vec3;
  canEdit: boolean;
  above?: number;
  write: (value: Vec3) => void;
}) {
  const { legend, value, canEdit, above, write } = props;
  return (
    <fieldset class="object-triple">
      <legend>{legend}</legend>
      {AXES.map((axis, i) => (
        <NumberBox
          key={axis}
          label={axis}
          value={value[i] as number}
          canEdit={canEdit}
          above={above}
          write={(n) => write(value.map((v, j) => (j === i ? n : v)) as unknown as Vec3)}
        />
      ))}
    </fieldset>
  );
}

function NumberBox(props: {
  label: string;
  value: number;
  canEdit: boolean;
  above?: number;
  write: (n: number) => void;
}) {
  const { label, value, canEdit, above, write } = props;
  const draft = useDraft(String(value));
  const id = useUniqueId();
  const n = parseNumber(draft.shown);
  const fits = n !== null && (above === undefined || n > above);
  return (
    <span class="object-number">
      <label for={id}>{label}</label>
      <input
        id={id}
        class="field form-input"
        type="text"
        inputMode="text"
        autoComplete="off"
        value={draft.shown}
        readOnly={!canEdit}
        aria-invalid={draft.draft !== null && !fits ? 'true' : undefined}
        data-project-field
        onInput={(event) => {
          const text = event.currentTarget.value;
          draft.setDraft(text);
          const typed = parseNumber(text);
          if (typed !== null && (above === undefined || typed > above)) write(typed);
        }}
        onBlur={() => {
          if (fits) draft.clear();
        }}
      />
    </span>
  );
}
