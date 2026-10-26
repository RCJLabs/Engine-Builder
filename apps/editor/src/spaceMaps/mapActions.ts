/**
 * Bake map (M6.6, D78, docs/specs/markers.md#baking): the open space drawn from above by the Scene
 * view, written as spaces/<id>.map.json and its image with the hash of what was drawn, one step of
 * undo. WebP where the browser writes it, else PNG, which the map's JSON names. And whether the map
 * there is stale: its hash against the space's as it stands now, as W154 says.
 */
import { type DrawnSources, mapImageNames, mapInputsHash, mapPath, SPACES_DIR } from '@eb/compiler';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import type { LiveSpace } from '../spaces/live.ts';
import { mapBaker, objectBoxes } from '../spaces/state.ts';
import { written } from '../terrain/terrainEdits.ts';
import { partsOf } from '../walk/solids.ts';
import { mapBaking } from './mapState.ts';
import { type MapShot, shotOf } from './shot.ts';

type Sound = LiveSpace & { readonly space: NonNullable<LiveSpace['space']> };

/** The records a map draws, through the project's index, and the types' model fields. */
export const drawnSources = (project: OpenProject): DrawnSources => ({
  record: (key) => {
    const record = project.index?.records.get(key);
    return record?.unreadable === undefined ? record?.value : undefined;
  },
  types: project.catalog.types,
});

/** The space's terrain files as the compiler reads them for the hash. */
const terrainFiles = (live: LiveSpace) => {
  const files: { heights?: Uint8Array; paint?: Uint8Array; foliage?: Uint8Array } = {};
  if (live.terrain?.heights) files.heights = live.terrain.heights;
  if (live.terrain?.paint) files.paint = live.terrain.paint;
  if (live.terrain?.foliage) files.foliage = live.terrain.foliage;
  return files;
};

/** What a bake would draw of the space as it stands: its hash. */
export const mapHashOf = (project: OpenProject, live: Sound): string =>
  mapInputsHash(live.open.id, live.space, live.prefabs, drawnSources(project), terrainFiles(live));

/** Whether the open space has a map, and whether it was baked from what is there now. */
export function mapStatus(project: OpenProject, live: LiveSpace | null): { has: boolean; stale: boolean } {
  if (!live?.space || !live.map) return { has: false, stale: false };
  let hash: unknown;
  try {
    hash = (JSON.parse(new TextDecoder().decode(live.map)) as { hash?: unknown }).hash;
  } catch {
    hash = undefined;
  }
  return { has: true, stale: hash !== mapHashOf(project, { ...live, space: live.space }) };
}

/** The canvas as WebP, or PNG from a browser that writes no WebP: `toBlob` falls back without saying. */
async function encoded(canvas: HTMLCanvasElement): Promise<{ bytes: Uint8Array; kind: 'webp' | 'png' }> {
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.85));
  if (!blob) throw new Error('The map couldn’t be written as an image');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: blob.type === 'image/webp' ? 'webp' : 'png' };
}

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

/** Where the open space is drawn from: its boxes as the view draws them, and its spawn points. */
export function shotHere(live: Sound): MapShot {
  const boxes = (objectBoxes.value?.() ?? []).map((boxed) => boxed.box);
  const spawns = partsOf(live.space, live.prefabs, () => null, new Set()).spawns.map((spawn) => spawn.at[1]);
  return shotOf(live.space, boxes, spawns);
}

/** Bakes the open space's map and writes it. What happened is said in `mapBaking`. */
export async function bakeMapHere(project: OpenProject, live: LiveSpace | null): Promise<void> {
  const space = live?.space;
  const bake = mapBaker.value;
  if (!live || !space || live.open.kind !== 'space' || !bake) return;
  const { path, id } = live.open;
  mapBaking.value = { path, words: 'Drawing…', busy: true };
  try {
    const sound = { ...live, space };
    const shot = shotHere(sound);
    const { bytes, kind } = await encoded(bake(shot));
    const image = `${id}.map.${kind}`;
    const file = { bounds: shot.bounds, size: [shot.pixels, shot.pixels], image, hash: mapHashOf(project, sound) };
    await editing.edit('Bake map', async (copy) => [
      // A map baked as PNG before, now WebP, or the other way: the old image goes.
      ...(
        await Promise.all(
          mapImageNames(id)
            .filter((name) => name !== image)
            .map((name) => written(copy, `${SPACES_DIR}/${name}`, null)),
        )
      ).flat(),
      ...(await written(copy, `${SPACES_DIR}/${image}`, bytes)),
      ...(await written(copy, mapPath(id), json(file))),
    ]);
    const across = Math.round(shot.bounds[2] - shot.bounds[0]);
    const words = `Baked: ${shot.pixels} px over ${across} m, ${Math.ceil(bytes.length / 1024)} kB of ${kind.toUpperCase()}.`;
    mapBaking.value = { path, words, busy: false };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    mapBaking.value = { path, words: `Couldn’t bake: ${why}`, busy: false };
  }
}
