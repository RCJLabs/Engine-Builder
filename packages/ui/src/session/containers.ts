/**
 * Containers as a screen shows them (M6.8, D80, docs/specs/barter.md#the-stage-and-the-screens): the
 * open container's or body's name and lines, each with the Take that moves it, through the inventory
 * kit's own facts and options, so a line on screen is what the sim would move.
 */
import { canonicalJson, type PackWorld } from '@eb/core';
import type { Entry, Shown } from './types.ts';
import type { Reading } from './views.ts';
import { nameOf } from './words.ts';

/** What the container mode is open on, as open-container pushes it. */
export type Opened = { readonly space: string; readonly object: string } | { readonly actor: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An object's name by its path through the prefabs it is placed in, or undefined when it has none. */
function objectName(world: PackWorld, space: string, path: string): string | undefined {
  let objects: unknown = isObject(world.spaces[space]) ? world.spaces[space].objects : undefined;
  let name: string | undefined;
  for (const id of path.split('/')) {
    const found = Array.isArray(objects) ? objects.find((o) => isObject(o) && o.id === id) : undefined;
    if (!isObject(found)) return undefined;
    name = typeof found.name === 'string' ? found.name : undefined;
    const prefab = typeof found.prefab === 'string' ? world.prefabs[found.prefab] : undefined;
    objects = isObject(prefab) ? prefab.objects : undefined;
  }
  return name;
}

/** Each container's name by `space/object`: its object's, or the last part of its path. */
export function containerNames(world: PackWorld | undefined): Readonly<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const [space, found] of Object.entries(world?.uses ?? {})) {
    for (const [path, use] of Object.entries(found)) {
      if (use.holds !== undefined) names[`${space}/${path}`] = objectName(world as PackWorld, space, path) ?? path;
    }
  }
  return names;
}

/** The frame's data as an opened container or body, if it is one. */
export function openedOf(data: unknown): Opened | undefined {
  if (!isObject(data)) return undefined;
  if (typeof data.actor === 'string') return { actor: data.actor };
  if (typeof data.space === 'string' && typeof data.object === 'string') {
    return { space: data.space, object: data.object };
  }
  return undefined;
}

/** The open container's name and its lines in item id order, each with the Take on offer for it. */
export function heldShows(
  reading: Reading,
  opened: Opened,
  names: Readonly<Record<string, string>>,
): { fields: Record<string, Shown>; entries: Entry[] } {
  const name =
    'actor' in opened
      ? (nameOf(reading.content, 'actor', opened.actor) ?? opened.actor)
      : (names[`${opened.space}/${opened.object}`] ?? opened.object);
  const count = (item: string) =>
    ('actor' in opened
      ? reading.fact('inventory.carried', { actor: opened.actor, item })
      : reading.fact('inventory.held', { space: opened.space, object: opened.object, item })) as number;
  const entries = reading.content.ids('item').flatMap((item) => {
    const n = count(item);
    if (!(n > 0)) return [];
    const action = { type: 'inventory/take', item };
    const fields = { item, name: nameOf(reading.content, 'item', item) ?? item, count: n };
    return [{ key: item, fields, action, enabled: reading.offered.has(canonicalJson(action)) }];
  });
  return { fields: { 'container.name': name }, entries };
}
