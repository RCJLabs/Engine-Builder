/**
 * Add → Tilemap… in a 2D space (M7.2, D84, docs/specs/tilemaps.md#the-editor): a tileset from the
 * project's, and a size in tiles, then a tilemap with one empty layer centred in the view, chosen,
 * with Paint ready once a tile is picked.
 */
import { TILES_MOST } from '@eb/core';
import { TILESET } from '@eb/schema';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { Picker } from '../forms/Picker.tsx';
import { refChoices } from '../forms/refChoices.ts';
import type { OpenProject } from '../projects/opened.ts';
import { namesOf } from '../records/names.ts';
import { liveOf } from '../spaces/live.ts';
import { openSpace } from '../spaces/state.ts';
import { addTilemap } from './tileActions.ts';
import { tileLayer } from './tiles2d.ts';

const whole = (text: string, fallback: number) => {
  const n = Number.parseInt(text, 10);
  return Number.isInteger(n) ? Math.min(TILES_MOST, Math.max(1, n)) : fallback;
};

export function AddTilemap2d({ project, done }: { project: OpenProject; done: () => void }) {
  const [tileset, setTileset] = useState<string | null>(null);
  const [cols, setCols] = useState('16');
  const [rows, setRows] = useState('10');
  const colsId = useUniqueId();
  const rowsId = useUniqueId();
  if (tileset === null)
    return (
      <Picker
        title="A tilemap’s tileset"
        choices={refChoices(
          { kind: 'ref', to: [TILESET] },
          project.catalog.records,
          namesOf(project.index, project.catalog),
        )}
        current=""
        empty="The project has no tilesets yet: add the starter sprites in the Assets panel, or make a tileset record from a sheet."
        choose={(key) => setTileset(key.slice(key.indexOf(':') + 1))}
        close={done}
      />
    );
  const add = () => {
    const tile = liveOf(openSpace.value)?.sprites?.tilesets.get(tileset)?.tile ?? [16, 16];
    tileLayer.value = 0;
    done();
    void addTilemap(tileset, [whole(cols, 16), whole(rows, 10)], tile);
  };
  return (
    <fieldset class="scene-add">
      <legend>A tilemap of {tileset}</legend>
      <label class="scene-step" for={colsId}>
        Columns
        <input
          id={colsId}
          class="form-input"
          type="number"
          min={1}
          max={TILES_MOST}
          value={cols}
          onInput={(e) => setCols(e.currentTarget.value)}
        />
      </label>
      <label class="scene-step" for={rowsId}>
        Rows
        <input
          id={rowsId}
          class="form-input"
          type="number"
          min={1}
          max={TILES_MOST}
          value={rows}
          onInput={(e) => setRows(e.currentTarget.value)}
        />
      </label>
      <button type="button" class="button" onClick={add}>
        Add tilemap
      </button>
      <button type="button" class="button" onClick={done}>
        Cancel
      </button>
    </fieldset>
  );
}
