/**
 * A battle against its space (M7.5, D87, docs/specs/tactics.md#checks): E096 for one whose space isn't a 2D
 * space with a tilemap, or whose unit stands on no object of it, on a tile that can't be walked, or on
 * another unit's tile. Each at the battle record's file. The tiles are those the pack's world gets (format
 * 18): a battle needs nothing packed of its own but its actors, whose sprites the stage draws (fightersOf).
 */
import { WALK } from '@eb/core';
import { BATTLE, TEAMS } from '@eb/kits';
import { type Diagnostic, type RecordInput, schemaIssues, severityOf, TILESET } from '@eb/schema';
import { type SpaceJson, spaceSchema } from './spaceShape.ts';
import type { SpaceFileRead } from './spaces.ts';
import { is2d } from './spaceView.ts';
import { packTilesOf, tilesetIn } from './tilemaps.ts';

interface Posted {
  readonly space: string;
  readonly crew: readonly { readonly actor: string; readonly at: string }[];
  readonly foes: readonly { readonly actor: string; readonly at: string }[];
}

const isPost = (value: unknown): value is { actor: string; at: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { actor?: unknown }).actor === 'string' &&
  typeof (value as { at?: unknown }).at === 'string';

const isBattle = (value: unknown): value is Posted => {
  const battle = value as Partial<Posted> | null;
  return (
    typeof battle?.space === 'string' &&
    TEAMS.every((side) => Array.isArray(battle[side]) && (battle[side] as unknown[]).every(isPost))
  );
};

/** The actors every battle sets out, each once, sorted: what the stage draws its units as. */
export function fightersOf(records: readonly RecordInput[]): string[] {
  const found = new Set<string>();
  for (const record of records)
    if (record.type === BATTLE && !record.unreadable && isBattle(record.value))
      for (const side of TEAMS) for (const post of record.value[side]) found.add(post.actor);
  return [...found].sort();
}

export function checkBattles(
  records: readonly RecordInput[],
  files: readonly SpaceFileRead[],
  value: (type: string, id: string) => unknown,
): Diagnostic[] {
  const sound = files.filter((f) => f.value !== undefined && schemaIssues(spaceSchema, f.value).length === 0);
  const spaces = new Map(sound.filter((f) => f.kind === 'space').map((f) => [f.id, f.value as SpaceJson]));
  const prefabs = Object.fromEntries(sound.filter((f) => f.kind === 'prefab').map((f) => [f.id, f.value]));
  const tilesetOf = (id: string) => tilesetIn(value(TILESET, id));
  const found: Diagnostic[] = [];
  for (const record of records) {
    if (record.type !== BATTLE || record.unreadable || !isBattle(record.value)) continue;
    const battle = record.value;
    const report = (path: string, message: string) =>
      found.push({
        code: 'E096',
        severity: severityOf('E096'),
        message,
        type: record.type,
        id: record.id,
        ...(record.file === undefined ? {} : { file: record.file }),
        path,
      });
    const space = spaces.get(battle.space);
    if (!space) {
      report('/space', `No space "${battle.space}"`);
      continue;
    }
    const tiles = is2d(space) ? packTilesOf(space, prefabs, tilesetOf) : undefined;
    if (!tiles) {
      const why = is2d(space) ? 'has no tilemap' : 'is a 3D space';
      report('/space', `${battle.space} ${why}: a battle is fought on a 2D space’s tilemap`);
      continue;
    }
    const held = new Map<string, string>();
    for (const side of TEAMS)
      for (const [i, post] of battle[side].entries()) {
        const at = `/${side}/${i}/at`;
        const tile = Object.hasOwn(tiles.places, post.at) ? tiles.places[post.at] : undefined;
        if (!tile) {
          report(at, `“${post.at}” is no object on ${battle.space}’s tilemap`);
          continue;
        }
        const [c, r] = tile;
        const rule = Number.parseInt(tiles.cells[r]?.[c] ?? '0', 16);
        const other = held.get(`${c},${r}`);
        if ((rule & WALK) === 0) report(at, `“${post.at}” is on tile ${c}, ${r}, which can’t be walked`);
        else if (other !== undefined) report(at, `“${post.at}” is on tile ${c}, ${r}, where “${other}” stands`);
        else held.set(`${c},${r}`, post.at);
      }
  }
  return found;
}
