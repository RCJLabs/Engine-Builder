/**
 * The 2D view's Tiles row, under its toolbar while a tilemap is chosen (M7.2, D84,
 * docs/specs/tilemaps.md#the-editor): the layer painted, the tileset's tiles as buttons drawn with
 * their frames, Paint, Erase, Edges with a kind, Show rules and Import ASCII…. A tool stays on until
 * pressed again; while one is on, a press on the view paints rather than choosing or panning. Every
 * button is 44 px.
 */
import type { EdgeKind } from '@eb/core';
import type { TilesetRecord } from '@eb/schema';
import { useEffect, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { liveOf } from '../spaces/live.ts';
import { openSpace } from '../spaces/state.ts';
import { TileFrame } from '../sprites/TileFrame.tsx';
import type { LiveSprites } from './liveSprites.ts';
import { sheetOf } from './sheets2d.ts';
import { importAscii, tilemapOf } from './tileActions.ts';
import { edgeKind, showRules, type TileTool, tileChar, tileLayer, tileTool } from './tiles2d.ts';

const KINDS: readonly (EdgeKind | null)[] = ['wall', 'hull', 'door', 'hatch', null];

export function TilesRow2d({ id }: { id: string }) {
  const now = liveOf(openSpace.value);
  const fields = tilemapOf(now?.space ?? undefined, id);
  const tileset = fields ? now?.sprites?.tilesets.get(fields.tileset) : undefined;
  const [importing, setImporting] = useState(false);
  const layerId = useUniqueId();
  const kindId = useUniqueId();
  if (!fields) return null;
  const canEdit = editing.access.value.kind === 'editing';
  const layer = Math.min(tileLayer.value, fields.layers.length - 1);
  const tool = tileTool.value;
  const toggle = (next: TileTool) => {
    tileTool.value = tool === next ? null : next;
  };
  return (
    <fieldset class="scene-toolbar tiles-row">
      <legend class="visually-hidden">Tiles</legend>
      <span class="scene-step">
        <label for={layerId}>Layer</label>
        <select
          id={layerId}
          class="form-select"
          value={String(layer)}
          onChange={(e) => {
            tileLayer.value = Number(e.currentTarget.value);
          }}
        >
          {fields.layers.map((l, i) => (
            <option key={l.id} value={String(i)}>
              {l.id}
            </option>
          ))}
        </select>
      </span>
      {tileset ? (
        <TileButtons live={now?.sprites ?? undefined} tileset={tileset} />
      ) : (
        <p class="muted">No tileset “{fields.tileset}”.</p>
      )}
      <button
        type="button"
        class="button"
        aria-pressed={tool === 'paint'}
        disabled={!canEdit || tileChar.value === null}
        onClick={() => toggle('paint')}
      >
        Paint
      </button>
      <button
        type="button"
        class="button"
        aria-pressed={tool === 'erase'}
        disabled={!canEdit}
        onClick={() => toggle('erase')}
      >
        Erase
      </button>
      <button
        type="button"
        class="button"
        aria-pressed={tool === 'edges'}
        disabled={!canEdit}
        onClick={() => toggle('edges')}
      >
        Edges
      </button>
      <span class="scene-step">
        <label for={kindId}>Edge</label>
        <select
          id={kindId}
          class="form-select"
          value={edgeKind.value ?? 'none'}
          onChange={(e) => {
            const v = e.currentTarget.value;
            edgeKind.value = v === 'none' ? null : (v as EdgeKind);
          }}
        >
          {KINDS.map((k) => (
            <option key={k ?? 'none'} value={k ?? 'none'}>
              {k ?? 'none'}
            </option>
          ))}
        </select>
      </span>
      <button
        type="button"
        class="button"
        aria-pressed={showRules.value}
        onClick={() => {
          showRules.value = !showRules.value;
        }}
      >
        Show rules
      </button>
      <button
        type="button"
        class="button"
        aria-expanded={importing}
        disabled={!canEdit}
        onClick={() => setImporting(!importing)}
      >
        Import ASCII…
      </button>
      {importing && tileset ? (
        <ImportAscii id={id} layer={layer} tileset={tileset} done={() => setImporting(false)} />
      ) : null}
    </fieldset>
  );
}

/**
 * The sheet as the view decoded it, from the live copy's bytes rather than the asset browser's
 * reader: that one brings the record index into the Scene panel's chunk.
 */
function useLiveSheet(live: LiveSprites | undefined, path: string): ImageBitmap | null {
  const [image, setImage] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    let on = true;
    if (live) void sheetOf(live, path).then((found) => on && setImage(found));
    return () => {
      on = false;
    };
  }, [live, path]);
  return image;
}

function TileButtons({ live, tileset }: { live: LiveSprites | undefined; tileset: TilesetRecord }) {
  const image = useLiveSheet(live, tileset.sheet);
  const zoom = Math.max(1, Math.floor(32 / Math.max(...tileset.tile)));
  return (
    <fieldset class="tiles-choices">
      <legend class="visually-hidden">Tiles</legend>
      {Object.entries(tileset.tiles).map(([name, tile]) => (
        <button
          key={name}
          type="button"
          class="button tile-button"
          aria-pressed={tileChar.value === tile.char}
          data-tile={name}
          onClick={() => {
            tileChar.value = tile.char;
            tileTool.value = 'paint';
          }}
        >
          {image ? <TileFrame image={image} tile={tileset.tile} frame={tile.frame} zoom={zoom} /> : null}
          <span>
            {name} <code>{tile.char}</code>
          </span>
        </button>
      ))}
    </fieldset>
  );
}

function ImportAscii(props: { id: string; layer: number; tileset: TilesetRecord; done: () => void }) {
  const { id, layer, tileset, done } = props;
  const [text, setText] = useState('');
  const [unknown, setUnknown] = useState<readonly string[]>([]);
  const textId = useUniqueId();
  const chars = new Set(Object.values(tileset.tiles).map((t) => t.char));
  const go = async () => {
    const refused = await importAscii(id, liveOf(openSpace.value)?.space ?? undefined, layer, text, chars);
    setUnknown(refused);
    if (refused.length === 0) done();
  };
  return (
    <div class="tiles-import">
      <label for={textId}>Paste a map: Space-Wrecked’s map text, or a character a tile</label>
      <textarea
        id={textId}
        class="form-input form-lines"
        rows={8}
        wrap="off"
        spellcheck={false}
        value={text}
        onInput={(e) => setText(e.currentTarget.value)}
      />
      {unknown.length > 0 ? (
        <p class="form-problem" role="alert">
          No tile is written as {unknown.map((ch) => `“${ch}”`).join(', ')}: nothing was changed.
        </p>
      ) : null}
      <button type="button" class="button" disabled={text.trim() === ''} onClick={() => void go()}>
        Import
      </button>
      <button type="button" class="button" onClick={done}>
        Cancel
      </button>
    </div>
  );
}
