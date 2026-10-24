/**
 * Add starter kit as file changes (M5.5, D67, docs/specs/models.md#the-starter-kit): the kit's
 * GLBs with their provenance entries and its model and material records, written into the open
 * project as one step, every file the project has already left as it is. The kit's own
 * project.json stays behind; its log's entries join the project's.
 */
import { ASSETS_DIR, ASSETS_LOG, type ProjectSource } from '@eb/compiler';
import type { Provenance } from '@eb/schema';
import { importEntered } from '../assets/assetEdits.ts';
import type { FileChange } from '../editing/history.ts';

export interface KitAdded {
  readonly changes: FileChange[];
  /** How many of the kit's files went in, and how many the project had already. */
  readonly added: number;
  readonly kept: number;
}

const PREFIX = `${ASSETS_DIR}/`;

/** The kit's files, by their paths in a project, written where the project lacks them. */
export async function addStarterKit(source: ProjectSource, kit: ReadonlyMap<string, Uint8Array>): Promise<KitAdded> {
  const logBytes = kit.get(ASSETS_LOG);
  const log = logBytes
    ? (JSON.parse(new TextDecoder().decode(logBytes)) as { files?: Record<string, Provenance> })
    : {};
  const assets: Parameters<typeof importEntered>[1][number][] = [];
  const records: FileChange[] = [];
  let kept = 0;
  for (const [path, bytes] of [...kit].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (path === ASSETS_LOG || path === 'project.json') continue;
    if ((await source.read(path)) !== undefined) {
      kept++;
      continue;
    }
    if (!path.startsWith(PREFIX)) {
      records.push({ path, before: null, after: bytes });
      continue;
    }
    const inside = path.slice(PREFIX.length);
    const entry = log.files?.[inside];
    if (!entry) throw new Error(`The starter kit has no provenance for ${inside}`);
    assets.push({ path: inside, bytes, entry });
  }
  const changes = [...(assets.length > 0 ? await importEntered(source, assets) : []), ...records];
  return { changes, added: assets.length + records.length, kept };
}
