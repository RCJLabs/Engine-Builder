/**
 * A space's or an object's tags in the inspector (M6.7, D79, docs/specs/radiant.md#in-the-editor), as
 * plain functions: a typed tag tidied into the words a file holds, whether it can be added, and every
 * tag the project's spaces and objects carry, which the box offers.
 */
import { RECORD_ID_PATTERN } from '@eb/core';
import type { SpaceTags } from '@eb/schema';

/** At most this many tags a space or an object, as the compiler holds them (E058). */
export const TAGS_MOST = 16;

/** What was typed, in a file's words: lowercase, spaces and underscores as hyphens, the ends trimmed. */
export const tidyTag = (typed: string): string =>
  typed
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/** Why the typed tag can't be added to `tags`, or undefined when it can. */
export function tagProblem(tag: string, tags: readonly string[]): string | undefined {
  if (tag === '') return undefined;
  if (!RECORD_ID_PATTERN.test(tag)) return 'A tag is lowercase words joined by hyphens';
  if (tags.includes(tag)) return `It is tagged ${tag} already`;
  if (tags.length >= TAGS_MOST) return `${TAGS_MOST} tags at most`;
  return undefined;
}

/** Every tag a space, an object or a placed actor carries, sorted, once each. */
export function projectTags(tags: SpaceTags | undefined): string[] {
  if (!tags) return [];
  const all = new Set<string>();
  for (const list of tags.spaces.values()) for (const tag of list) all.add(tag);
  for (const found of tags.objects.values()) for (const list of found.values()) for (const tag of list) all.add(tag);
  return [...all].sort();
}
