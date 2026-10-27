/**
 * The 2D view's sheets (M7.1, D83): each sheet the live copy read, decoded once into a bitmap and
 * kept by the hash of its bytes, so a change elsewhere in the project decodes nothing again. The
 * view draws with the stage's own drawFrame through them.
 */
import type { SpriteRecord } from '@eb/schema';
import type { Sheets } from '../stage2d/draw.ts';
import type { LiveSprites } from './liveSprites.ts';

const decoded = new Map<string, Promise<ImageBitmap | null>>();

function decode(hash: string, bytes: Uint8Array): Promise<ImageBitmap | null> {
  let found = decoded.get(hash);
  if (!found) {
    // E091 says a sheet isn't a PNG; the view draws nothing for it.
    found = createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' })).catch(() => null);
    decoded.set(hash, found);
  }
  return found;
}

export async function sheetsOf(live: LiveSprites): Promise<Sheets> {
  const images = new Map<string, ImageBitmap>();
  await Promise.all(
    [...live.sheets].map(async ([path, read]) => {
      const image = read ? await decode(read.hash, read.bytes) : null;
      if (image) images.set(path, image);
    }),
  );
  const record = (sprite: string): SpriteRecord | undefined => live.records.get(sprite);
  const image = (sprite: string) => {
    const found = record(sprite);
    return found ? images.get(found.sheet) : undefined;
  };
  return { record, image, width: (sprite) => image(sprite)?.width ?? 0 };
}
