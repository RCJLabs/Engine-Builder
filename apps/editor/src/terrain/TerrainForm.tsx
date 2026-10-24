/**
 * The terrain's form in the inspector (M5.3, D65): its spacing, low and high, and its layers'
 * names and colours, with Add layer, Remove layer and Remove terrain. It shows while nothing is
 * chosen in a space with a terrain. A new low or high is written as the field is left, not as each
 * key lands: a range passed through on the way to the one typed would clamp heights for good.
 */
import type { TerrainJson } from '@eb/compiler';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { NumberRow, TextBox } from '../spaces/ObjectFields.tsx';
import { removeLayerHere, removeTerrainHere, setTerrain } from './actions.ts';
import { DEFAULT_LAYERS } from './terrainEdits.ts';

const SPACING = { least: 0.25, most: 16 } as const;

export function TerrainForm({ terrain }: { terrain: TerrainJson }) {
  const canEdit = editing.access.value.kind === 'editing';
  const set = (next: Partial<TerrainJson>, label: string, field: string) =>
    void setTerrain({ ...terrain, ...next }, label, field);
  const extent = (terrain.size - 1) * terrain.spacing;
  return (
    <form class="object-form terrain-form" onSubmit={(event) => event.preventDefault()}>
      <h3>Terrain</h3>
      <p class="muted">
        {terrain.size} × {terrain.size} vertices, {Number(extent.toFixed(2))} m across, centred on the space’s origin.
      </p>
      <NumberRow
        label="Spacing, in metres between vertices"
        value={terrain.spacing}
        canEdit={canEdit}
        fits={(n) => n >= SPACING.least && n <= SPACING.most}
        why={`From ${SPACING.least} to ${SPACING.most} m`}
        write={(spacing) => set({ spacing }, 'Terrain spacing', 'spacing')}
      />
      <NumberRow
        label="Low, in metres: the heights file’s 0"
        value={terrain.low}
        canEdit={canEdit}
        onLeave
        fits={(n) => n < terrain.high}
        why="Below high"
        write={(low) => set({ low }, 'Terrain low', 'low')}
      />
      <NumberRow
        label="High, in metres: the heights file’s 65535"
        value={terrain.high}
        canEdit={canEdit}
        onLeave
        fits={(n) => n > terrain.low}
        why="Above low"
        write={(high) => set({ high }, 'Terrain high', 'high')}
      />
      <fieldset class="terrain-layers">
        <legend>Layers, painted in the view</legend>
        {terrain.layers.map((_, k) => (
          <Layer
            key={k}
            k={k}
            terrain={terrain}
            canEdit={canEdit}
            set={(next, label, field) =>
              set({ layers: terrain.layers.map((l, n) => (n === k ? { ...l, ...next } : l)) }, label, field)
            }
          />
        ))}
        {canEdit && terrain.layers.length < 4 ? (
          <button
            type="button"
            class="button"
            onClick={() =>
              set(
                { layers: [...terrain.layers, DEFAULT_LAYERS[terrain.layers.length] as TerrainJson['layers'][number]] },
                'Add layer',
                `add-${terrain.layers.length}`,
              )
            }
          >
            Add layer
          </button>
        ) : null}
      </fieldset>
      {canEdit ? (
        <button type="button" class="button" onClick={() => void removeTerrainHere()}>
          Remove terrain
        </button>
      ) : null}
    </form>
  );
}

function Layer(props: {
  k: number;
  terrain: TerrainJson;
  canEdit: boolean;
  set: (next: Partial<TerrainJson['layers'][number]>, label: string, field: string) => void;
}) {
  const { k, terrain, canEdit, set } = props;
  const layer = terrain.layers[k] as TerrainJson['layers'][number];
  const nameId = useUniqueId();
  const colorId = useUniqueId();
  return (
    <div class="terrain-layer">
      <span class="terrain-field">
        <label for={nameId}>Layer {k + 1}</label>
        <TextBox
          id={nameId}
          value={layer.name}
          canEdit={canEdit}
          write={(name) => {
            const kept = name.trim().slice(0, 40);
            if (kept !== '') set({ name: kept }, `Rename layer ${k + 1}`, `layer-${k}-name`);
          }}
        />
      </span>
      <span class="terrain-field">
        <label for={colorId}>Colour</label>
        <input
          id={colorId}
          class="field object-color"
          type="color"
          value={layer.color}
          disabled={!canEdit}
          onInput={(event) => set({ color: event.currentTarget.value }, `Colour of ${layer.name}`, `layer-${k}-color`)}
        />
      </span>
      {canEdit && terrain.layers.length > 1 ? (
        <button type="button" class="button" onClick={() => void removeLayerHere(k, layer.name)}>
          Remove {layer.name}
        </button>
      ) : null}
    </div>
  );
}
