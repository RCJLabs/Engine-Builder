/**
 * The terrain tools in the Scene panel's toolbar (M5.3, D65, docs/specs/terrain.md#the-editor):
 * without a terrain, a size and Add terrain; with one, Camera and the five brushes, the layer to
 * paint, Radius and Strength, and Terrain settings, which opens the terrain's form in the inspector.
 * With foliage listed (M5.6), Plant and Clear too, and the type they paint with Fill, in
 * FoliageTools. Closing the row puts the pointer back to moving the camera.
 */
import { TERRAIN_SIZES, type TerrainJson } from '@eb/compiler';
import { useEffect, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { showPanel } from '../app/panelControl.ts';
import { editing } from '../editing/current.ts';
import { FoliageTools } from '../foliage/FoliageTools.tsx';
import { pick } from '../spaces/state.ts';
import { addTerrainHere } from './actions.ts';
import type { BrushKind } from './brushes.ts';
import { brushKind, brushLayer, brushRadius, brushStrength, RADIUS, STRENGTH } from './state.ts';

const BRUSHES: readonly { kind: BrushKind | null; label: string }[] = [
  { kind: null, label: 'Camera' },
  { kind: 'raise', label: 'Raise' },
  { kind: 'lower', label: 'Lower' },
  { kind: 'smooth', label: 'Smooth' },
  { kind: 'flatten', label: 'Flatten' },
  { kind: 'paint', label: 'Paint' },
];

/** After Paint, once the terrain lists a foliage type. */
const FOLIAGE_BRUSHES: readonly { kind: BrushKind; label: string }[] = [
  { kind: 'plant', label: 'Plant' },
  { kind: 'clear', label: 'Clear' },
];

export function TerrainTools({ terrain }: { terrain: TerrainJson | undefined }) {
  // Gone with the row, or with the space: a brush left chosen would stroke where none is shown.
  useEffect(
    () => () => {
      brushKind.value = null;
    },
    [],
  );
  return (
    <fieldset class="scene-add terrain-tools">
      <legend class="visually-hidden">Terrain tools</legend>
      {terrain ? <Brushes terrain={terrain} /> : <AddTerrain />}
    </fieldset>
  );
}

function AddTerrain() {
  const [size, setSize] = useState<number>(129);
  const id = useUniqueId();
  const canEdit = editing.access.value.kind === 'editing';
  return (
    <>
      <span class="terrain-field">
        <label for={id}>Size</label>
        <select id={id} class="field" value={size} onChange={(event) => setSize(Number(event.currentTarget.value))}>
          {TERRAIN_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} × {n} vertices, {n - 1} m across
            </option>
          ))}
        </select>
      </span>
      <button type="button" class="button" disabled={!canEdit} onClick={() => void addTerrainHere(size)}>
        Add terrain
      </button>
    </>
  );
}

function Brushes({ terrain }: { terrain: TerrainJson }) {
  const canEdit = editing.access.value.kind === 'editing';
  const layerId = useUniqueId();
  const kind = brushKind.value;
  const layers = terrain.layers;
  // A layer taken away: Paint goes on with the last one left.
  useEffect(() => {
    if (brushLayer.value >= layers.length) brushLayer.value = layers.length - 1;
  }, [layers.length]);
  const brushes = (terrain.foliage ?? []).length > 0 ? [...BRUSHES, ...FOLIAGE_BRUSHES] : BRUSHES;
  return (
    <>
      {brushes.map((brush) => (
        <button
          key={brush.label}
          type="button"
          class="button"
          aria-pressed={kind === brush.kind}
          disabled={brush.kind !== null && !canEdit}
          onClick={() => {
            brushKind.value = brush.kind;
          }}
        >
          {brush.label}
        </button>
      ))}
      {kind === 'paint' ? (
        <span class="terrain-field">
          <label for={layerId}>Layer</label>
          <select
            id={layerId}
            class="field"
            value={Math.min(brushLayer.value, layers.length - 1)}
            onChange={(event) => {
              brushLayer.value = Number(event.currentTarget.value);
            }}
          >
            {layers.map((layer, k) => (
              <option key={k} value={k}>
                {layer.name}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      {kind === 'plant' || kind === 'clear' ? <FoliageTools terrain={terrain} /> : null}
      <Slider
        label="Radius"
        unit="m"
        value={brushRadius.value}
        min={RADIUS.least}
        max={RADIUS.most}
        step={0.5}
        set={(n) => {
          brushRadius.value = n;
        }}
      />
      <Slider
        label="Strength"
        value={brushStrength.value}
        min={STRENGTH.least}
        max={STRENGTH.most}
        step={0.05}
        set={(n) => {
          brushStrength.value = n;
        }}
      />
      <button
        type="button"
        class="button"
        onClick={() => {
          pick([]);
          showPanel('inspector');
        }}
      >
        Terrain settings
      </button>
    </>
  );
}

function Slider(props: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  set: (n: number) => void;
}) {
  const id = useUniqueId();
  return (
    <span class="terrain-field terrain-slider">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        class="form-slider"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(event) => props.set(Number(event.currentTarget.value))}
      />
      <output for={id}>
        {Number(props.value.toFixed(2))}
        {props.unit ? ` ${props.unit}` : ''}
      </output>
    </span>
  );
}
