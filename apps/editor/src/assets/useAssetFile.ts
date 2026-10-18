/**
 * An asset's bytes and the browser's ways to show them (M2.7): an object URL for an image or a
 * sound, a FontFace for a font. Each is read when shown, again only when a change names that
 * file (fileVersion), and let go when no longer shown, so a page of thumbnails holds no more
 * than it shows.
 */
import { useEffect, useState } from 'preact/hooks';
import { fileVersion, type OpenProject } from '../projects/opened.ts';
import { assetFile } from './assetEdits.ts';
import { mimeOf } from './media.ts';

export interface AssetFile {
  /** Undefined while it reads; null when there is no such file. */
  readonly bytes: Uint8Array | null | undefined;
  /** For images and sounds, when asked for. */
  readonly url: string | null;
}

const READING: AssetFile = { bytes: undefined, url: null };

export function useAssetFile(project: OpenProject, path: string, withUrl: boolean): AssetFile {
  const version = fileVersion(assetFile(path));
  const [file, setFile] = useState<AssetFile>(READING);
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    project.source.read(assetFile(path)).then(
      (bytes) => {
        if (!live) return;
        if (bytes && withUrl) url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(path) }));
        setFile({ bytes: bytes ?? null, url });
      },
      () => live && setFile({ bytes: null, url: null }),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [project.source, path, version, withUrl]);
  return file;
}

let faces = 0;

/** The font in the bytes, added to the page under a family name of its own while shown; null until it loads or if it can't. */
export function useFontFace(bytes: Uint8Array | null | undefined): string | null {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes || typeof FontFace === 'undefined') return;
    let live = true;
    const name = `eb-asset-font-${++faces}`;
    const face = new FontFace(name, bytes.slice().buffer);
    face.load().then(
      () => {
        if (!live) return;
        document.fonts.add(face);
        setFamily(name);
      },
      () => live && setFamily(null),
    );
    return () => {
      live = false;
      document.fonts.delete(face);
      setFamily(null);
    };
  }, [bytes]);
  return family;
}
