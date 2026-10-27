/**
 * Where a 2D space starts (M7.1, D83, docs/specs/2d-scenes.md#play): its fit, the art pixels the
 * camera keeps within (its own `size`, or what its objects cover), the camera's first centre (on the
 * spawn point arrived at, or the space's start, or its bottom-left view), and its backdrop.
 */
import { FIT_DEFAULT, isFields, type SpaceJson } from '@eb/compiler';
import type { SpaceAsk } from '@eb/ui';
import type { Point } from './camera.ts';
import type { Sheets } from './draw.ts';
import { worldBox } from './place.ts';
import { type Item, placesOf } from './scene.ts';

export const BACKDROP_DEFAULT = '#000000';

/** What the space's objects cover, from its origin up and to the right; parallax layers aside. */
export function coveredBy(items: readonly Item[], sheets: Pick<Sheets, 'record'>): Point {
  let [w, h] = [1, 1];
  for (const item of items) {
    if (item.parallax) continue;
    const sprite = item.look.kind === 'sprite' ? sheets.record(item.look.sprite) : undefined;
    const box = worldBox(item, item.at, sprite);
    w = Math.max(w, box.x + box.w);
    h = Math.max(h, box.y + box.h);
  }
  return [w, h];
}

export function spaceStart(
  space: SpaceJson,
  items: readonly Item[],
  sheets: Pick<Sheets, 'record'>,
  ask: Pick<SpaceAsk, 'arrive'>,
) {
  const fit = (space.fit ?? FIT_DEFAULT) as readonly [number, number];
  const size = (space.size ?? coveredBy(items, sheets)) as Point;
  const places = placesOf(space, {});
  const spawn = space.objects.find((o) => {
    const fields = o.components?.spawn;
    return isFields(fields) && (ask.arrive !== undefined ? o.id === ask.arrive : fields.start === true);
  });
  const at = spawn ? places.get(spawn.id) : undefined;
  const start: Point = at ?? [Math.floor(fit[0] / 2), Math.floor(fit[1] / 2)];
  return { fit, size, start, backdrop: space.backdrop ?? BACKDROP_DEFAULT };
}
