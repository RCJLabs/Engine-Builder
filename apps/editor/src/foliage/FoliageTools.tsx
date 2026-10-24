/**
 * Plant and Clear's part of the terrain's row (M5.6, D68, docs/specs/foliage.md#the-editor): the
 * foliage type the brush paints, and Fill, which sets that type's density everywhere, nowhere or
 * from a paint layer in one step.
 */
import type { TerrainJson } from '@eb/compiler';
import { FOLIAGE } from '@eb/schema';
import { useEffect } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { current } from '../projects/opened.ts';
import { nameIn } from '../records/names.ts';
import { brushFoliage, brushKind } from '../terrain/state.ts';
import { fillFoliageHere } from './actions.ts';
import type { Fill } from './foliageEdits.ts';

/** A foliage record's name as the project's index has it, or its id. */
export function foliageName(id: string): string {
  const project = current.value;
  const file = project?.catalog.types.get(FOLIAGE)?.file;
  return nameIn(file, project?.index?.records.get(`${FOLIAGE}:${id}`)?.value) ?? id;
}

const fillOf = (value: string): Fill | null =>
  value === 'everywhere' || value === 'nowhere'
    ? { kind: value }
    : value.startsWith('layer-')
      ? { kind: 'layer', layer: Number(value.slice(6)) }
      : null;

export function FoliageTools({ terrain }: { terrain: TerrainJson }) {
  const listed = terrain.foliage ?? [];
  const typeId = useUniqueId();
  const fillId = useUniqueId();
  const canEdit = editing.access.value.kind === 'editing';
  // A type taken away: Plant goes on with the last one left, or Camera with none.
  useEffect(() => {
    if (brushFoliage.value >= listed.length) brushFoliage.value = Math.max(0, listed.length - 1);
    if (listed.length === 0 && (brushKind.value === 'plant' || brushKind.value === 'clear')) brushKind.value = null;
  }, [listed.length]);
  const k = Math.min(brushFoliage.value, listed.length - 1);
  const name = foliageName(listed[k] ?? '');
  return (
    <>
      <span class="terrain-field">
        <label for={typeId}>Foliage</label>
        <select
          id={typeId}
          class="field"
          value={k}
          onChange={(event) => {
            brushFoliage.value = Number(event.currentTarget.value);
          }}
        >
          {listed.map((id, n) => (
            <option key={id} value={n}>
              {foliageName(id)}
            </option>
          ))}
        </select>
      </span>
      <span class="terrain-field">
        <label for={fillId}>Fill</label>
        <select
          id={fillId}
          class="field"
          value=""
          disabled={!canEdit}
          onChange={(event) => {
            const fill = fillOf(event.currentTarget.value);
            const how =
              fill?.kind === 'layer' ? `from ${terrain.layers[fill.layer]?.name ?? 'a layer'}` : (fill?.kind ?? '');
            if (fill) void fillFoliageHere(k, fill, `Fill ${name} ${how}`);
          }}
        >
          <option value="">{name}…</option>
          <option value="everywhere">Everywhere</option>
          <option value="nowhere">Nowhere</option>
          {terrain.layers.map((layer, n) => (
            <option key={n} value={`layer-${n}`}>
              Where {layer.name} is
            </option>
          ))}
        </select>
      </span>
    </>
  );
}
