/**
 * The sheets a stage is given (M7.4, D86): each sheet a sprite, tileset or room's sprite of the world
 * draws from, decoded once into a bitmap and keyed by its path inside assets/, as the stage's own
 * files name them. A sheet that won't decode is left out, as stage2d leaves it out.
 */
import type { PackWorld } from '@eb/core';

const bytesOf = (base64: string): Uint8Array<ArrayBuffer> => {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
};

export async function sheetsByPath(world: PackWorld): Promise<Map<string, ImageBitmap>> {
  const paths = new Set<string>();
  for (const [key, value] of Object.entries(world.records)) {
    const sheet = (value as { sheet?: unknown } | undefined)?.sheet;
    if ((key.startsWith('sprite:') || key.startsWith('tileset:')) && typeof sheet === 'string') paths.add(sheet);
  }
  const found = new Map<string, ImageBitmap>();
  await Promise.all(
    [...paths].sort().map(async (path) => {
      const file = world.files[`assets/${path}`];
      if (file === undefined) return;
      try {
        found.set(path, await createImageBitmap(new Blob([bytesOf(file)], { type: 'image/png' })));
      } catch {
        // E091 and E092 keep a sheet that isn't a PNG from a pack.
      }
    }),
  );
  return found;
}
