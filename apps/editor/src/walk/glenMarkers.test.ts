/**
 * The glen's quests followed headless (M6.6's gate, D78, docs/specs/markers.md#the-gate): played
 * through the session as the stage plays it, the sim's markers after each step turned into points by
 * the walk's own places and the doors between the glen, the bothy and the shed: the rope and the gate
 * of the quest that starts with the game, the bothy's door and then the lamp inside, the way to the
 * shed from the bothy and from the glen, and nothing once the player is in the shed. And the map's
 * pins where the sim last heard the player stood.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, memorySource, type SpaceJson } from '@eb/compiler';
import { type Action, doorsOf, doorToward, type PackWorld } from '@eb/core';
import { type Opened, openPack, type Play, startPlay } from '@eb/ui/session';
import { beforeAll, describe, expect, it } from 'vitest';
import { objectPlaces } from './goals.ts';
import { mapOf } from './mapPins.ts';
import { markerPoints } from './markers.ts';

const GLEN = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/glen');

function filesOf(root: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(root, path).split('\\').join('/')] = readFileSync(path);
    }
  };
  walk(root);
  return files;
}

let opened: Opened;
let world: PackWorld;
beforeAll(async () => {
  const compiled = await compileWithGame(memorySource(filesOf(GLEN)));
  expect(compiled.diagnostics).toEqual([]);
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  opened = open.opened;
  if (!compiled.pack?.world) throw new Error('The glen has no world');
  world = compiled.pack.world;
});

const use = (space: string, object: string): Action => ({ type: 'world/use', space, object });

/** Each marker as the walk in `here` would place it: its objective, the door it stands in at, and where. */
function pointsIn(play: Play) {
  const here = play.view.world?.space ?? '';
  const prefabs = new Map(Object.entries(world.prefabs).map(([id, value]) => [id, value as SpaceJson]));
  const places = objectPlaces(world.spaces[here] as SpaceJson, prefabs);
  const doors = doorsOf({ uses: world.uses ?? {}, triggers: world.triggers });
  return markerPoints(play.view.world?.markers ?? [], {
    here,
    doors,
    place: (path) => places.get(path),
    actor: () => undefined,
  }).map((p) => [p.objective, p.door ?? null, p.at.map((n) => Math.round(n * 100) / 100)]);
}

describe('the glen’s markers', () => {
  it('follows the quest the game starts with, the one started after it, and the journal’s Track', () => {
    const play = startPlay(opened.setup, 'glen');
    const take = (action: Action) => {
      const step = play.take(action);
      if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    };
    // Find your feet: its rope read from the count of world/used, its gate written.
    expect(pointsIn(play)).toEqual([
      ['rope', null, [0, 0.5, 6.5]],
      ['gate', null, [3, 0.5, -2.5]],
    ]);
    // The rope starts the supplies, which are tracked: the lamp is in the bothy, so its door stands in.
    take(use('glen', 'rope'));
    expect(pointsIn(play)).toEqual([['lamp', 'bothy-door', [-6, 0.5, -3.9]]]);
    // The journal tracks the first again: the rope is done, the gate is left.
    expect(play.act({ type: 'quests/track', quest: 'settle' }).accepted).toBe(true);
    expect(pointsIn(play)).toEqual([['gate', null, [3, 0.5, -2.5]]]);
    expect(play.act({ type: 'quests/track', quest: 'supplies' }).accepted).toBe(true);
    // In the bothy, the lamp itself.
    take(use('glen', 'bothy-door'));
    const lamp = pointsIn(play);
    expect(lamp).toHaveLength(1);
    expect(lamp[0]?.slice(0, 2)).toEqual(['lamp', null]);
    // The lamp taken, the shed is next: out of the bothy by its way out, then the shed's door, a zone.
    take(use('bothy', 'lamp'));
    expect(pointsIn(play)).toEqual([['shed', 'way-out', [0, 0.5, 2.45]]]);
    take(use('bothy', 'way-out'));
    expect(pointsIn(play)).toEqual([['shed', 'shed-door', [6, 0.5, -3.6]]]);
    take({ type: 'world/trigger', space: 'glen', object: 'shed-door' });
    // In the shed the supplies are stored, and so the gate's objective is done: both quests are, and
    // with nothing tracked there is nothing to point at.
    expect(play.view.world?.space).toBe('shed');
    expect(play.state.quests).toMatchObject({ quests: { supplies: { state: 'done' }, settle: { state: 'done' } } });
    expect(play.view.world?.markers).toBeUndefined();
  });

  it('finds the fewest doors between the glen’s spaces', () => {
    const doors = doorsOf({ uses: world.uses ?? {}, triggers: world.triggers });
    expect(doorToward(doors, 'bothy', 'shed')).toBe('way-out');
    expect(doorToward(doors, 'glen', 'shed')).toBe('shed-door');
    expect(doorToward(doors, 'shed', 'bothy')).toBe('way-out');
    expect(doorToward(doors, 'glen', 'glen')).toBeUndefined();
  });

  it('pins the player where the sim last heard them stand, and the targets, on the map', () => {
    const play = startPlay(opened.setup, 'glen');
    play.take({ type: 'world/at', space: 'glen', feet: [1, 0, 4], yaw: 30 });
    const map = mapOf(world, {
      space: 'glen',
      markers: play.view.world?.markers ?? [],
      ...(play.view.world?.at ? { at: { feet: play.view.world.at.feet, yaw: play.view.world.at.yaw } } : {}),
    });
    expect(map.pins.map((pin) => [pin.kind, pin.objective ?? null, pin.at])).toEqual([
      ['player', null, [1, 4]],
      ['target', 'rope', [0, 6.5]],
      ['target', 'gate', [3, -2.5]],
    ]);
  });
});
