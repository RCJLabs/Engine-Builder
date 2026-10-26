/**
 * The templates New project offers (M4.11, D61, docs/specs/templates.md): listed by the repo's
 * templates/templates.json, each a project folder bundled into the editor as a chunk of its own,
 * loaded only when chosen, so the service worker keeps them offline and an empty project costs
 * nothing. A template's files become the author's project through the compiler's fromTemplate,
 * as `eb new` makes them.
 */
import { fromTemplate, type TemplateEntry } from '@eb/compiler';
import listed from '../../../../templates/templates.json?raw';
import { bundledFiles } from '../models/bundled.ts';

export const TEMPLATES: readonly TemplateEntry[] = JSON.parse(listed) as TemplateEntry[];

interface Bundled {
  readonly files: Record<string, string>;
  /** Its files that aren't text, as data URLs: a 3D template's models and navmeshes (M6.9). */
  readonly binaries?: Record<string, string>;
  readonly prefix: string;
}

const BUNDLES: Readonly<Record<string, () => Promise<Bundled>>> = {
  'salvage-coast': () => import('./templateFiles/salvageCoast.ts'),
  'last-ferry': () => import('./templateFiles/lastFerry.ts'),
  'valley-hamlet': () => import('./templateFiles/valleyHamlet.ts'),
  lighthouse: () => import('./templateFiles/lighthouse.ts'),
};

/** A template's own files, by their paths in the project. */
export async function templateFiles(id: string): Promise<Map<string, Uint8Array>> {
  const load = BUNDLES[id];
  if (!load) throw new Error(`There is no template "${id}".`);
  const { files, binaries = {}, prefix } = await load();
  return bundledFiles(binaries, files, prefix);
}

/** The files of a new project named `name`, made from the template `id`. */
export async function projectFromTemplate(id: string, name: string): Promise<Map<string, Uint8Array>> {
  return fromTemplate(await templateFiles(id), name);
}
