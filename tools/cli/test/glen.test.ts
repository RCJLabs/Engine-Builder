/**
 * eb with the glen (M5.9's gate, D71, docs/specs/worldspaces.md#the-gate): a glen with a bothy and a
 * shed, a rope and a lamp to take, a door each way of each kind, and a quest whose stage a zone sets.
 * eb validates it clean and builds it as format 10; played through the session as the stage would
 * play it, each door moves the player, each take is kept, and a save puts them back where they stood.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import type { Action } from '@eb/core';
import { type Opened, openPack, resumeFrom, saveOf, startPlay } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const GLEN = resolve(import.meta.dirname, 'fixtures/glen');

async function opened(): Promise<Opened> {
  const compiled = await compileWithGame(folderSource(GLEN));
  expect(compiled.diagnostics).toEqual([]);
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  return open.opened;
}

const use = (space: string, object: string): Action => ({ type: 'world/use', space, object });
const zone = (space: string, object: string): Action => ({ type: 'world/trigger', space, object });

describe('eb with the glen', () => {
  it('builds it as format 10: each space’s uses by their label, its spawn points, and the glen to start in', async () => {
    const { pack } = await opened();
    expect(pack.format).toBe(10);
    const labels = Object.fromEntries(
      Object.entries(pack.world?.uses ?? {}).map(([space, uses]) => [
        space,
        Object.fromEntries(Object.entries(uses).map(([path, found]) => [path, found.label])),
      ]),
    );
    expect(labels).toEqual({
      bothy: { lamp: 'Take', 'way-out': 'Go out' },
      glen: { 'bothy-door': 'Open', rope: 'Take' },
      shed: { 'way-out': 'Go out' },
    });
    expect(pack.world?.spawns).toEqual({ bothy: ['door'], glen: ['bothy-out', 'shed-out', 'start'], shed: ['door'] });
    expect(pack.world?.start).toBe('glen');
  });

  it('takes, goes in and out by each door, and sets the quest’s stage at the gate', async () => {
    const open = await opened();
    const play = startPlay(open.setup, 'glen');
    const take = (action: Action) => {
      const step = play.take(action);
      if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
      return step;
    };
    expect(play.view.world).toEqual({ space: 'glen', taken: [] });
    take(use('glen', 'rope'));
    expect(play.view.world?.taken).toEqual(['glen/rope']);
    expect(play.take(use('glen', 'rope')).accepted).toBe(false);
    // An interact's door: in, the lamp taken, and out again by the other.
    take(use('glen', 'bothy-door'));
    expect(play.view.world).toEqual({ space: 'bothy', arrive: 'door', taken: ['glen/rope'] });
    take(use('bothy', 'lamp'));
    take(use('bothy', 'way-out'));
    expect(play.view.world).toMatchObject({ space: 'glen', arrive: 'bothy-out' });
    // Both taken: the quest moves on by itself; the gate's zone sets its last stage.
    expect(play.state.quests).toMatchObject({ quests: { supplies: { state: 'active', stage: 'store' } } });
    take(zone('glen', 'gate'));
    expect(play.state.quests).toMatchObject({ quests: { supplies: { state: 'done', stage: 'stored' } } });
    expect(play.view.conditions['quests.reached(quest: supplies, stage: stored)']).toBe(true);
    // A zone's door: into the shed, and out by its interact.
    take(zone('glen', 'shed-door'));
    expect(play.view.world?.space).toBe('shed');
    take(use('shed', 'way-out'));
    expect(play.view.world).toMatchObject({ space: 'glen', arrive: 'shed-out' });
    expect(play.view.facts['inventory.count(item: rope)']).toBe(1);
    expect(play.view.facts['inventory.count(item: lamp)']).toBe(1);
  });

  it('saves where the player stood and what was taken, and a load puts them back, in the bothy', async () => {
    const open = await opened();
    const play = startPlay(open.setup, 'glen');
    for (const action of [use('glen', 'rope'), use('glen', 'bothy-door')]) play.take(action);
    play.take({ type: 'world/at', space: 'bothy', feet: [0.5, 0, -0.2], yaw: 12.5 });
    const file = saveOf(open, play, { edition: 'test' }, 1000);
    const resumed = resumeFrom(open, JSON.stringify(file));
    if (!resumed.ok) throw new Error(resumed.message);
    expect(resumed.play.view.world).toEqual({
      space: 'bothy',
      at: { space: 'bothy', feet: [0.5, 0, -0.2], yaw: 12.5 },
      arrive: 'door',
      taken: ['glen/rope'],
    });
    // A world/at from the glen, a stage a step behind, changes nothing.
    expect(resumed.play.take({ type: 'world/at', space: 'glen', feet: [0, 0, 0], yaw: 0 }).accepted).toBe(false);
  });

  it('loads a save made by the world module’s version 2, migrated with no NPC walking, in the bothy', async () => {
    const open = await opened();
    const raw = readFileSync(resolve(import.meta.dirname, 'fixtures/saves/glen-world-v2.json'), 'utf8');
    const resumed = resumeFrom(open, raw);
    if (!resumed.ok) throw new Error(resumed.message);
    expect(resumed.report.migrated).toEqual([{ module: 'world', from: 2, to: 3 }]);
    expect(resumed.report).toMatchObject({ replayed: 3, skipped: 0 });
    expect(resumed.play.state.world).toEqual({
      fired: [],
      taken: ['glen/rope'],
      space: 'bothy',
      arrive: 'door',
      at: { space: 'bothy', feet: [0.5, 0, -0.2], yaw: 12.5 },
      npcs: {},
    });
    expect(resumed.play.take(use('bothy', 'lamp')).accepted).toBe(true);
  });
});
