/**
 * The spaces' warnings over what each object places (M5.2, M5.3): more than one start (W142), and
 * water off a plane (W145), each at the space's object whose placing makes it so.
 */
import type { Diagnostic } from '@eb/schema';
import { eachPlaced, isFields } from './overrides.ts';
import type { SpaceJson, SpaceObject } from './spaceShape.ts';

/** W142 at each object, past the first, whose spawn (its own or one it places) is the space's start. */
export function starts(file: string, space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>): Diagnostic[] {
  const found: Diagnostic[] = [];
  let seen = 0;
  space.objects.forEach((object, i) => {
    let here = 0;
    eachPlaced(object, prefabs, (o) => {
      if (isFields(o.components?.spawn) && o.components.spawn.start === true) here++;
    });
    if (here > 0 && seen + here > 1) {
      found.push({
        code: 'W142',
        severity: 'warning',
        message: `${seen + here} spawns are this space's start: a space is entered at one`,
        file,
        path: `/objects/${i}`,
      });
    }
    seen += here;
  });
  return found;
}

const dry = (o: SpaceObject) => isFields(o.components?.water) && o.shape !== 'plane';

/**
 * W145 at each object whose water isn't on a plane (M5.3): its own, or one a placement's overrides
 * make so. An object inside a prefab that is so as the prefab has it is the prefab file's warning.
 */
export function waters(file: string, space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>): Diagnostic[] {
  const found: Diagnostic[] = [];
  space.objects.forEach((object, i) => {
    eachPlaced(object, prefabs, (seen, ids) => {
      if (!dry(seen)) return;
      let own: SpaceObject | undefined = object;
      for (const id of ids.slice(1)) {
        own = own?.prefab === undefined ? undefined : prefabs.get(own.prefab)?.objects.find((o) => o.id === id);
      }
      if (ids.length > 1 && own && dry(own)) return;
      const where = ids.length > 1 ? ` (${ids.join(' › ')})` : '';
      found.push({
        code: 'W145',
        severity: 'warning',
        message: `Water off a plane${where}: only a plane's top is a water surface`,
        file,
        path: `/objects/${i}`,
      });
    });
  });
  return found;
}
