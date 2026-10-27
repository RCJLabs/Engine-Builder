/**
 * A sheet among the project's assets decoded into a bitmap (M7.2): what the tileset's preview and the
 * Tiles row's buttons draw frames from. Undefined while it is read, null when it isn't a PNG.
 */
import { useEffect, useState } from 'preact/hooks';
import { useAssetFile } from '../assets/useAssetFile.ts';
import type { OpenProject } from '../projects/opened.ts';

export function useSheetImage(project: OpenProject, sheet: string): ImageBitmap | null | undefined {
  const { bytes } = useAssetFile(project, sheet, false);
  const [image, setImage] = useState<ImageBitmap | null | undefined>(undefined);
  useEffect(() => {
    if (!bytes) return;
    let on = true;
    createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' })).then(
      (bitmap) => on && setImage(bitmap),
      () => on && setImage(null),
    );
    return () => {
      on = false;
    };
  }, [bytes]);
  return image;
}
