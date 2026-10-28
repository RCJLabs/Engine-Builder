/**
 * The assets a game's screens show in image widgets, packed as data URLs (M7.4, D86, pack format 20),
 * so a screen draws its image in play and in every export with no file to fetch. The screens are
 * checked by then: each image widget names an image under assets/ (E018, E047).
 */
import type { PackUi } from '@eb/core';
import { base64Of } from './audioFiles.ts';
import { ASSETS_DIR } from './layout.ts';
import type { ProjectSource } from './source.ts';

// By extension, as the asset kinds name them (@eb/schema's ASSET_TYPES.image).
const MEDIA: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

/** Every asset an image widget names, anywhere in a screen: in panels, grids, tabs and lists' items. */
export function imageAssetsOf(screens: Readonly<Record<string, unknown>>): string[] {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) for (const item of value) walk(item);
    else if (typeof value === 'object' && value !== null) {
      const widget = value as Record<string, unknown>;
      if (widget.widget === 'image' && typeof widget.asset === 'string') found.add(widget.asset);
      for (const child of Object.values(widget)) walk(child);
    }
  };
  walk(screens);
  return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The screens with the images they show, or as they are when they show none. */
export async function withImages(source: ProjectSource, ui: PackUi | undefined): Promise<PackUi | undefined> {
  if (ui === undefined) return undefined;
  const images: Record<string, string> = {};
  for (const path of imageAssetsOf(ui.screens)) {
    const media = MEDIA[path.slice(path.lastIndexOf('.') + 1).toLowerCase()];
    const bytes = await source.read(`${ASSETS_DIR}/${path}`);
    if (media !== undefined && bytes !== undefined) images[path] = `data:${media};base64,${base64Of(bytes)}`;
  }
  return Object.keys(images).length > 0 ? { ...ui, images } : ui;
}
