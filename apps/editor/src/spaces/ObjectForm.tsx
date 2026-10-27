/**
 * The inspector's form for the objects chosen in the Scene panel (M5.1,
 * docs/specs/viewport.md#the-inspector): one object's name, place, turn and scale, and its shape
 * and colour, its prefab or its record; several, how many, with Group into prefab and Delete in the
 * toolbar. Typing into a field joins into one step of undo, as the record form's fields do. Its
 * components follow, and a placement's parts (M5.2): a record's fields here, a prefab's objects,
 * each object inside one opening its own form, every change an override. With nothing chosen in a
 * space, its environment (M5.4) and, with a terrain, the terrain's form (M5.3) and its foliage (M5.6).
 * A space and each object have their tags (M6.7), which quests find them by.
 */
import { is2d, SHAPES } from '@eb/compiler';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { EnvironmentField } from '../environment/EnvironmentField.tsx';
import { FoliageSection } from '../foliage/FoliageSection.tsx';
import type { OpenProject } from '../projects/opened.ts';
import { TerrainForm } from '../terrain/TerrainForm.tsx';
import { deleteChosen, placeAxis, setObject, setSpaceTags } from './actions.ts';
import { ComponentsSection } from './ComponentsSection.tsx';
import type { Transform } from './gizmoMath.ts';
import { liveOf } from './live.ts';
import { TextBox, Triple } from './ObjectFields.tsx';
import { InsideList, InsideObject, RecordHere } from './PlacedParts.tsx';
import { GREY, nameOf, type SpaceJson, type SpaceObject, transformOf } from './spaceFile.ts';
import { inside, openSpace, openSpaceFile, picked } from './state.ts';
import { TagsField } from './TagsField.tsx';
import { projectTags } from './tags.ts';

export function ObjectForm({ project }: { project: OpenProject }) {
  const open = openSpace.value;
  const now = liveOf(open);
  const ids = picked.value;
  if (!open) return <p class="muted">Open a space or a prefab in the Scene panel to edit its objects here.</p>;
  if (!now?.space) return <p class="muted">{now?.problem ?? `Opening ${open.path}…`}</p>;
  const objects = now.space.objects.filter((o) => ids.includes(o.id));
  const known = projectTags(project.index?.flagsElsewhere?.tags);
  // A 2D space (M7.1) has no environment or terrain, and its objects don't turn.
  const flat = open.kind === 'space' && is2d(now.space);
  if (objects.length === 0) {
    const { terrain } = now.space;
    return (
      <>
        <p class="muted">Choose an object in the view or the outliner to edit it here.</p>
        {open.kind === 'space' ? (
          <TagsField
            key={`${open.path}#tags`}
            of={now.space.name}
            tags={now.space.tags ?? []}
            known={known}
            canEdit={editing.access.value.kind === 'editing'}
            write={(tags) => void setSpaceTags(tags)}
          />
        ) : null}
        {open.kind === 'space' && !flat ? (
          <EnvironmentField
            key={`${open.path}#environment`}
            project={project}
            id={now.space.environment}
            record={now.environment?.record}
          />
        ) : null}
        {terrain && open.kind === 'space' ? (
          <>
            <TerrainForm key={open.path} terrain={terrain} />
            <FoliageSection key={`${open.path}#foliage`} project={project} terrain={terrain} foliage={now.foliage} />
          </>
        ) : null}
      </>
    );
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
  const index = now.space.objects.indexOf(object);
  const place = { project, file: open.path, index, placement: object, prefabs: now.prefabs, inside: inside.value };
  if (place.inside.length > 0) return <InsideObject key={`${open.path}#${place.inside.join('/')}`} {...place} />;
  return (
    <>
      <OneObject key={`${open.path}#${object.id}`} object={object} prefabs={now.prefabs} known={known} flat={flat} />
      <ComponentsSection project={project} file={open.path} index={index} object={object} />
      {object.record !== undefined ? <RecordHere {...place} record={object.record} /> : null}
      {object.prefab !== undefined ? <InsideList {...place} /> : null}
    </>
  );
}

interface OneProps {
  readonly object: SpaceObject;
  readonly prefabs: ReadonlyMap<string, SpaceJson>;
  readonly known: readonly string[];
  /** In a 2D space: places in art pixels, z the depth, and no turn. */
  readonly flat: boolean;
}

function OneObject({ object, prefabs, known, flat }: OneProps) {
  const canEdit = editing.access.value.kind === 'editing';
  const t = transformOf(object);
  const place = (part: keyof Transform, what: string) => (axis: number, n: number) =>
    void placeAxis(object.id, part, axis, n, what);
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
      <TagsField
        of={nameOf(object)}
        tags={object.tags ?? []}
        known={known}
        canEdit={canEdit}
        write={(tags) =>
          void setObject(object.id, { tags: tags.length > 0 ? [...tags] : undefined }, `Tags of ${object.id}`)
        }
      />
      <Triple
        legend={flat ? 'Place, in art pixels: z is its depth' : 'Place, in metres'}
        value={t.at}
        canEdit={canEdit}
        write={place('at', 'Move')}
      />
      {flat ? null : (
        <Triple legend="Turn, in degrees" value={t.turn} canEdit={canEdit} write={place('turn', 'Turn')} />
      )}
      <Triple legend="Scale" value={t.scale} canEdit={canEdit} above={0} write={place('scale', 'Scale')} />
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
      ) : object.prefab !== undefined ? (
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
      ) : null}
    </form>
  );
}
