/**
 * The sheets a 2D space draws from (M7.1, D83): each sprite record the world carries, and its PNG
 * among the world's files as base64, decoded once into a bitmap before the first frame is drawn.
 */
import type { PackWorld } from '@eb/core';
import type { SpriteRecord } from '@eb/schema';
import type { Sheets } from './draw.ts';

const SPRITE = 'sprite:';

const bytesOf = (base64: string): Uint8Array<ArrayBuffer> => {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
};

/** Every sprite the world carries, its sheet decoded: a sprite whose sheet won't decode is left out. */
export async function loadSheets(world: PackWorld): Promise<Sheets> {
  const records = new Map<string, SpriteRecord>();
  const images = new Map<string, ImageBitmap>();
  await Promise.all(
    Object.entries(world.records)
      .filter(([key]) => key.startsWith(SPRITE))
      .map(async ([key, value]) => {
        const record = value as SpriteRecord;
        const file = world.files[`assets/${record.sheet}`];
        if (file === undefined) return;
        try {
          const image = await createImageBitmap(new Blob([bytesOf(file)], { type: 'image/png' }));
          records.set(key.slice(SPRITE.length), record);
          images.set(key.slice(SPRITE.length), image);
        } catch {
          // E091 keeps a sheet that isn't a PNG from a pack; a bad one is drawn as nothing.
        }
      }),
  );
  return {
    record: (sprite) => records.get(sprite),
    image: (sprite) => images.get(sprite),
    width: (sprite) => images.get(sprite)?.width ?? 0,
  };
}
