/**
 * The walk's quest markers (M6.6, D78, docs/specs/markers.md): each frame, the sim's markers for the
 * tracked quest turned into points for the space walked (markers.ts), measured from the player and
 * the camera, and drawn (markerView.ts). The doors between spaces and each placed actor's space are
 * found once a walk; an NPC here stands where the crowd has it, or where it was placed.
 */

import { eachPlaced, type SpaceJson } from '@eb/compiler';
import { doorsOf, type PackWorld } from '@eb/core';
import type { SpaceAsk } from '@eb/ui';
import type { Vec3 } from '../spaces/vec.ts';
import { bearingOf, distanceOf, type MarkerWorld, markerPoints } from './markers.ts';
import { createMarkerView, type WalkMarker } from './markerView.ts';

const ACTOR = 'actor:';

/**
 * Each placed actor's space and object path: the pack's own where it says (format 11 on), else found
 * among the spaces' placements through prefabs, the first by space id (E077 keeps an actor to one).
 */
export function actorPlacesOf(world: PackWorld): Map<string, { readonly space: string; readonly path: string }> {
  const found = new Map<string, { space: string; path: string }>();
  const prefabs = new Map(Object.entries(world.prefabs).map(([id, value]) => [id, value as SpaceJson]));
  for (const space of Object.keys(world.spaces).sort()) {
    for (const object of (world.spaces[space] as SpaceJson).objects) {
      eachPlaced(object, prefabs, (seen, ids) => {
        const actor = seen.record?.startsWith(ACTOR) ? seen.record.slice(ACTOR.length) : undefined;
        if (actor !== undefined && !found.has(actor)) found.set(actor, { space, path: ids.join('/') });
      });
    }
  }
  for (const [actor, placed] of Object.entries(world.actors ?? {})) found.set(actor, placed);
  return found;
}

/** What the walk knows of the space it walks. */
export interface MarkedSpace {
  readonly space: string;
  /** Every object's place by its path (goals.ts's objectPlaces). */
  readonly places: ReadonlyMap<string, Vec3>;
  /** An NPC's height, for its marker over its head. */
  height(actor: string): number;
  /** Where the crowd has each NPC that walks now, by actor. */
  walking(): ReadonlyMap<string, Vec3>;
}

export interface MarkerStage {
  frame(feet: Vec3, yaw: number): void;
  /** The markers shown at the last frame, for window.__ebWalk.markers(). */
  hook(): readonly WalkMarker[];
  dispose(): void;
}

export function createMarkerStage(
  box: HTMLElement,
  ask: SpaceAsk,
  world: PackWorld,
  here: MarkedSpace,
  screenOf: (point: Vec3) => [number, number] | null,
): MarkerStage {
  const view = createMarkerView(box);
  const actors = actorPlacesOf(world);
  const markerWorld: MarkerWorld = {
    here: here.space,
    doors: doorsOf({ uses: world.uses ?? {}, triggers: world.triggers }),
    place: (path) => here.places.get(path),
    actor: (id) => {
      const placed = actors.get(id);
      if (!placed) return undefined;
      if (placed.space !== here.space) return { space: placed.space };
      const at = here.walking().get(id) ?? here.places.get(placed.path);
      return { space: placed.space, ...(at ? { at } : {}), height: here.height(id) };
    },
  };
  let shown: readonly WalkMarker[] = [];
  const visible = (point: [number, number] | null): readonly [number, number] | null =>
    point && point[0] >= 0 && point[1] >= 0 && point[0] <= box.clientWidth && point[1] <= box.clientHeight
      ? point
      : null;
  return {
    frame(feet, yaw) {
      const points = markerPoints(ask.markers?.() ?? [], markerWorld);
      shown = points.map((point) => ({
        ...point,
        bearing: bearingOf(feet, point.at, yaw),
        distance: distanceOf(feet, point.at),
        screen: visible(screenOf(point.at)),
      }));
      view.draw(shown, yaw);
    },
    hook: () => shown,
    dispose: () => view.dispose(),
  };
}
