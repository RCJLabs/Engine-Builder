/**
 * What a battle's form offers (M7.5, D87, docs/specs/tactics.md#in-the-editor): for its Space, the project's
 * spaces; for each unit's At, the objects of the space it names, through prefabs, as a quest's target offers
 * them (quests/targetChoices.ts). Whether the space is 2D with a tilemap, and each object stands on a tile that
 * can be walked, is E096's to say. A plain function of the record and the project's spaces and objects.
 */
import type { Path } from '../forms/values.ts';
import type { TargetSources } from '../quests/targetChoices.ts';

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The choices for the field at `path` in `battle`, or none for a field that isn't its space or a unit's post. */
export function battleChoices(
  battle: unknown,
  sources: Pick<TargetSources, 'spaces' | 'objects'>,
  path: Path,
): readonly string[] | undefined {
  if (path.length === 1 && path[0] === 'space') return [...sources.spaces].sort();
  const [side, , field] = path;
  if (path.length !== 3 || (side !== 'crew' && side !== 'foes') || field !== 'at') return undefined;
  const space = isObject(battle) ? battle.space : undefined;
  return typeof space === 'string' ? [...(sources.objects.get(space) ?? [])].sort() : [];
}
