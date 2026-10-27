/**
 * Above a tileset record's form (M7.2, D84, docs/specs/tilemaps.md#the-editor): its sheet at a whole
 * zoom with the tile grid over it, each tile drawn with its character, name and rules, and each edge
 * kind's frames and the post.
 */
import type { TilesetRecord, TilesetTile } from '@eb/schema';
import { useEffect, useRef } from 'preact/hooks';
import type { OpenProject } from '../projects/opened.ts';
import { TileFrame } from './TileFrame.tsx';
import { useSheetImage } from './useSheet.ts';
import '../styles/sprites.css';

const SHEET_MOST = 320;
const ZOOM_MOST = 8;
const EDGE_KINDS = ['wall', 'hull', 'door', 'hatch'] as const;

const isTileset = (value: unknown): value is TilesetRecord =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as TilesetRecord).sheet === 'string' &&
  Array.isArray((value as TilesetRecord).tile) &&
  typeof (value as TilesetRecord).tiles === 'object';

/** A tile's rules in words. */
export function rulesOf(tile: TilesetTile): string {
  const said = [tile.walk === true ? 'walked on' : 'not walked on'];
  if (tile.cover) said.push(`${tile.cover} cover`);
  if (tile.blocksSight === true) said.push('blocks sight');
  if (tile.joins === true) said.push('joins');
  return said.join(', ');
}

export function TilesetPreview({ project, value }: { project: OpenProject; value: unknown }) {
  if (!isTileset(value) || !project.catalog.assets.includes(value.sheet)) return null;
  return <Preview project={project} tileset={value} />;
}

function Preview({ project, tileset }: { project: OpenProject; tileset: TilesetRecord }) {
  const image = useSheetImage(project, tileset.sheet);
  if (image === undefined) return <p class="muted">Reading assets/{tileset.sheet}…</p>;
  if (!image) return null;
  const zoom = Math.max(1, Math.floor(32 / Math.max(...tileset.tile)));
  const edges = tileset.edges;
  return (
    <section class="sprite-head" aria-label="The tileset’s sheet, tiles and edges">
      <Grid image={image} tileset={tileset} />
      <ul class="tileset-tiles">
        {Object.entries(tileset.tiles).map(([id, tile]) => (
          <li key={id} class="tileset-tile" data-tile={id}>
            <TileFrame image={image} tile={tileset.tile} frame={tile.frame} zoom={zoom} />
            <span>
              <code>{tile.char}</code> <strong>{id}</strong>: {rulesOf(tile)}
            </span>
          </li>
        ))}
        {edges
          ? EDGE_KINDS.flatMap((kind) => {
              const frames = edges[kind];
              return frames
                ? [
                    <li key={kind} class="tileset-tile" data-edge={kind}>
                      <TileFrame image={image} tile={tileset.tile} frame={frames.across} zoom={zoom} />
                      <TileFrame image={image} tile={tileset.tile} frame={frames.down} zoom={zoom} />
                      <span>
                        <strong>{kind}</strong>, across and down
                      </span>
                    </li>,
                  ]
                : [];
            })
          : null}
      </ul>
    </section>
  );
}

function Grid({ image, tileset }: { image: ImageBitmap; tileset: TilesetRecord }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const zoom = Math.max(1, Math.min(ZOOM_MOST, Math.floor(SHEET_MOST / image.width)));
  const [tw, th] = tileset.tile;
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const [w, h] = [image.width * zoom, image.height * zoom];
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);
    ctx.fillStyle = 'rgb(255 209 102 / 80%)';
    for (let x = 0; x <= image.width; x += tw) ctx.fillRect(Math.min(x * zoom, w - 1), 0, 1, h);
    for (let y = 0; y <= image.height; y += th) ctx.fillRect(0, Math.min(y * zoom, h - 1), w, 1);
  }, [image, tw, th, zoom]);
  const count = Math.floor(image.width / tw) * Math.floor(image.height / th);
  return (
    <canvas
      ref={canvas}
      class="sprite-sheet"
      width={image.width * zoom}
      height={image.height * zoom}
      role="img"
      aria-label={`${tileset.sheet}: ${count} tiles of ${tw}×${th}, drawn at ${zoom}×`}
    />
  );
}
