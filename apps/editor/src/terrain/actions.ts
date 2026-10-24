/**
 * The terrain's edits as steps of the editor's undo (M5.3): each over the space open and its two
 * files. Typing into one of the form's fields joins into one step, as the object form's do.
 */
import type { TerrainJson } from '@eb/compiler';
import { editing } from '../editing/current.ts';
import { openSpace } from '../spaces/state.ts';
import type { Brush } from './brushes.ts';
import type { TerrainGrid } from './grid.ts';
import { brushKind } from './state.ts';
import type { Stroke } from './stroke.ts';
import {
  addTerrain,
  changeTerrain,
  fileOf,
  newTerrain,
  removeLayer,
  removeTerrain,
  writeStroke,
} from './terrainEdits.ts';

const VERBS: Record<Exclude<Brush['kind'], 'paint' | 'plant' | 'clear'>, string> = {
  raise: 'Raise',
  lower: 'Lower',
  smooth: 'Smooth',
  flatten: 'Flatten',
};

/** A stroke's step in the undo list: "Raise the terrain", "Paint Rock", "Plant Glade, trees" (M5.6). */
export function strokeLabel(brush: Brush, layers: TerrainJson['layers'], foliage: readonly string[] = []): string {
  if (brush.kind === 'paint') return `Paint ${layers[brush.layer]?.name ?? 'the terrain'}`;
  if (brush.kind === 'plant') return `Plant ${foliage[brush.foliage] ?? 'foliage'}`;
  if (brush.kind === 'clear') return `Clear ${foliage[brush.foliage] ?? 'foliage'}`;
  return `${VERBS[brush.kind]} the terrain`;
}

const spaceOpen = () => {
  const open = openSpace.value;
  return open?.kind === 'space' ? open : null;
};

export function addTerrainHere(size: number): Promise<void> {
  const open = spaceOpen();
  if (!open) return Promise.resolve();
  return editing.edit('Add terrain', (copy) => addTerrain(copy, open.id, newTerrain(size)));
}

export function removeTerrainHere(): Promise<void> {
  const open = spaceOpen();
  if (!open) return Promise.resolve();
  brushKind.value = null;
  return editing.edit('Remove terrain', (copy) => removeTerrain(copy, open.id));
}

/** The form's settings: `field` names the step typing joins. */
export function setTerrain(next: TerrainJson, label: string, field: string): Promise<void> {
  const open = spaceOpen();
  if (!open) return Promise.resolve();
  return editing.edit(label, (copy) => changeTerrain(copy, open.id, next), `${open.path}#terrain#${field}`);
}

export function removeLayerHere(k: number, name: string): Promise<void> {
  const open = spaceOpen();
  if (!open) return Promise.resolve();
  return editing.edit(`Remove layer ${name}`, (copy) => removeLayer(copy, open.id, k));
}

/** A stroke written as one step, its file encoded now, from the grid as the stroke left it. */
export function writeStrokeHere(
  stroke: Stroke,
  grid: TerrainGrid,
  layers: TerrainJson['layers'],
  foliage: readonly string[] = [],
): Promise<void> {
  const open = spaceOpen();
  if (!open) return Promise.resolve();
  const bytes = fileOf(grid, stroke.part);
  const label = strokeLabel(stroke.brush, layers, foliage);
  return editing.edit(label, (copy) => writeStroke(copy, open.id, stroke.part, bytes));
}
