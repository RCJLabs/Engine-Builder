/**
 * What a quest's objective's target offers in its form (M6.6, D78, docs/specs/markers.md#in-the-editor):
 * the actors and the quest's slots of actors for Actor, the project's spaces for Space, and for Object
 * the objects of the space it names, through prefabs. Since M6.7 (D79) its space and object slots too,
 * and a slot's In: the spaces and the space slots before it. A plain function of the record and the project.
 */
import type { Path } from '../forms/values.ts';
import type { OpenProject } from '../projects/opened.ts';

export interface TargetSources {
  /** Every actor's id. */
  readonly actors: readonly string[];
  /** Every space's id. */
  readonly spaces: readonly string[];
  /** Each space's object paths, through prefabs. */
  readonly objects: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The open project's actors, spaces and objects, as its index and catalog have them. */
export function targetSources(project: OpenProject): TargetSources {
  const actors = [...(project.index?.records.keys() ?? [])].flatMap((key) =>
    key.startsWith('actor:') ? [key.slice('actor:'.length)] : [],
  );
  return {
    actors,
    spaces: project.catalog.spaces.map((space) => space.id),
    objects: project.index?.flagsElsewhere?.objects ?? new Map(),
  };
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The quest's slots of a type, as `@slot`: those before slot `before` when it is given, and In `inside`. */
function slotsOf(quest: unknown, type: string, before?: number, inside?: string): string[] {
  const slots = isObject(quest) && Array.isArray(quest.slots) ? quest.slots.slice(0, before) : [];
  return slots.flatMap((slot) =>
    isObject(slot) && slot.type === type && typeof slot.id === 'string' && (inside === undefined || slot.in === inside)
      ? [`@${slot.id}`]
      : [],
  );
}

/** A slot's In (M6.7): the spaces, then the space slots before it. */
function inChoices(quest: unknown, sources: TargetSources, path: Path): readonly string[] | undefined {
  const [slots, i, field] = path;
  if (path.length !== 3 || slots !== 'slots' || field !== 'in' || typeof i !== 'number') return undefined;
  return [...[...sources.spaces].sort(), ...slotsOf(quest, 'space', i)];
}

/** The choices for the field at `path` in `quest`, or none for a field that isn't a target's. */
export function targetChoices(quest: unknown, sources: TargetSources, path: Path): readonly string[] | undefined {
  const [stages, s, objectives, o, target, field] = path;
  if (path.length !== 6 || stages !== 'stages' || objectives !== 'objectives' || target !== 'target')
    return inChoices(quest, sources, path);
  if (field === 'actor') return [...[...sources.actors].sort(), ...slotsOf(quest, 'actor')];
  if (field === 'space') return [...[...sources.spaces].sort(), ...slotsOf(quest, 'space')];
  if (field !== 'object' || !isObject(quest) || !Array.isArray(quest.stages)) return undefined;
  const stage = quest.stages[s as number];
  const objective = isObject(stage) && Array.isArray(stage.objectives) ? stage.objectives[o as number] : undefined;
  const space = isObject(objective) && isObject(objective.target) ? objective.target.space : undefined;
  if (typeof space !== 'string') return [];
  // An object slot In the space the target names, after the space's own objects.
  return [...[...(sources.objects.get(space) ?? [])].sort(), ...slotsOf(quest, 'object', undefined, space)];
}
