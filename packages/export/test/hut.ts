/**
 * The hut (tools/cli/test/fixtures/hut, Phase 3's gate) as the export tests take it: its files in
 * memory, a map of the summit added for a taster edition to leave out, compiled with its game as
 * the editor's worker and eb export compile it, and a stand-in for the engine's runtime.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, editionSource, leaveOutOf, memorySource, type ProjectSource } from '@eb/compiler';
import type { BuildPack, Runtime } from '../src/index.ts';

const HUT = join(import.meta.dirname, '../../../tools/cli/test/fixtures/hut');

function filesIn(dir: string, root = dir): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(files, filesIn(full, root));
    else files[relative(root, full).split('\\').join('/')] = new Uint8Array(readFileSync(full));
  }
  return files;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export const SUMMIT_MAP = {
  name: 'A map of the summit',
  // Its "&" is written \\u0026 inside the page's boot JSON: the leak check must look for that too.
  description: 'Every bolt & anchor on the north face, marked in red by a guide who came back.',
  value: 40,
};

export const TASTER = {
  name: 'The hut',
  editions: { taster: { 'leave-out': { records: ['item:summit-map'] } } },
  targets: {
    web: { edition: 'full', domain: 'hut.example.com' },
    file: { edition: 'taster' },
    itch: { edition: 'taster' },
    android: { package: 'com.rcjlabs.thehut', fingerprints: [`${'AB:'.repeat(31)}CD`] },
  },
};

/** The hut's files with the summit map and export.json, and any changes on top (null deletes). */
export function hutSource(changes: Record<string, string | Uint8Array | null> = {}): ProjectSource {
  const files: Record<string, string | Uint8Array> = {
    ...filesIn(HUT),
    'records/item/summit-map.json': json(SUMMIT_MAP),
    'export.json': json(TASTER),
  };
  for (const [path, value] of Object.entries(changes)) {
    if (value === null) delete files[path];
    else files[path] = value;
  }
  return memorySource(files);
}

/** The full game's pack and an edition's, as plain JSON, compiled with the hut's own game. */
export async function hutPacks(
  source = hutSource(),
  edition = 'taster',
): Promise<{ full: BuildPack; edition: BuildPack }> {
  const full = await compileWithGame(source);
  if (!full.pack) throw new Error(`The hut didn't compile: ${full.diagnostics.map((d) => d.message).join('; ')}`);
  const settings = JSON.parse(new TextDecoder().decode(await source.read('export.json')));
  const cut = await compileWithGame(editionSource(source, leaveOutOf(settings, edition)));
  if (!cut.pack) throw new Error(`The ${edition} didn't compile: ${cut.diagnostics.map((d) => d.message).join('; ')}`);
  const plain = (pack: unknown) => JSON.parse(JSON.stringify(pack)) as BuildPack;
  return { full: plain(full.pack), edition: plain(cut.pack) };
}

/** A runtime that stands in for apps/editor's game page: enough text to find and take out. */
export const RUNTIME: Runtime = {
  version: '0.0.1',
  js: 'const engine = "the engine\'s own code, the same in every edition"; if (a </script>/.test(b)) {}\n',
  css: 'body { margin: 0 }\n',
};

export const settingsOf = async (source: ProjectSource) =>
  JSON.parse(new TextDecoder().decode(await source.read('export.json')));
