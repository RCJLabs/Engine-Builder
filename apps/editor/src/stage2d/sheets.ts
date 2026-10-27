/**
 * The sheets a 2D space draws from (M7.1, D83): each sprite record the world carries, and its PNG
 * among the world's files as base64, decoded once into a bitmap before the first frame is drawn;
 * since M7.2 each tileset's the same way.
 */
import type { PackWorld } from '@eb/core';
import type { SpriteRecord, TilesetRecord } from '@eb/schema';
import type { Sheets } from './draw.ts';

const SPRITE = 'sprite:';
const TILESET = 'tileset:';

const bytesOf = (base64: string): Uint8Array<ArrayBuffer> => {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
};

/** Each record of a type the world carries whose sheet decodes, by id, with its bitmap. */
async function decoded<T extends { readonly sheet: string }>(
  world: PackWorld,
  prefix: string,
): Promise<Map<string, { record: T; image: ImageBitmap }>> {
  const found = new Map<string, { record: T; image: ImageBitmap }>();
  await Promise.all(
    Object.entries(world.records)
      .filter(([key]) => key.startsWith(prefix))
      .map(async ([key, value]) => {
        const record = value as T;
        const file = world.files[`assets/${record.sheet}`];
        if (file === undefined) return;
        try {
          const image = await createImageBitmap(new Blob([bytesOf(file)], { type: 'image/png' }));
          found.set(key.slice(prefix.length), { record, image });
        } catch {
          // E091 and E092 keep a sheet that isn't a PNG from a pack; a bad one is drawn as nothing.
        }
      }),
  );
  return found;
}

/** Every sprite and tileset the world carries, its sheet decoded: one whose sheet won't decode is left out. */
export async function loadSheets(world: PackWorld): Promise<Sheets> {
  const [sprites, tilesets] = await Promise.all([
    decoded<SpriteRecord>(world, SPRITE),
    decoded<TilesetRecord>(world, TILESET),
  ]);
  return {
    record: (sprite) => sprites.get(sprite)?.record,
    image: (sprite) => sprites.get(sprite)?.image,
    width: (sprite) => sprites.get(sprite)?.image.width ?? 0,
    tileset: (id) => tilesets.get(id),
  };
}
