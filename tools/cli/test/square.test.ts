/**
 * eb with the square (M6.2's gate, D74, docs/specs/navigation.md#the-gate): a market square with
 * three stalls, a well and a gate, a carter whose talk sends them to the well and twelve villagers
 * the market's zone sends back and forth across it. eb validates it clean and builds it as format
 * 11, its navmesh and its thirteen actors packed; played through the session as the stage would
 * play it, walk-to gives each a goal, world/npcs-at's arrivals are heard as world/npc-arrived and
 * the sheet sends each on; and moving a stall, a corrupt .nav and a walk-to nowhere each break it.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import type { Action } from '@eb/core';
import { type Opened, openPack, resumeFrom, saveOf, startPlay } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const SQUARE = resolve(import.meta.dirname, 'fixtures/square');
const VILLAGERS = ['ash', 'bea', 'cal', 'dot', 'eli', 'fen', 'gil', 'hal', 'ivy', 'jo', 'kit', 'lin'];

async function opened(): Promise<Opened> {
  const compiled = await compileWithGame(folderSource(SQUARE));
  expect(compiled.diagnostics).toEqual([]);
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  return open.opened;
}

interface Npc {
  readonly space: string;
  readonly feet?: readonly number[];
  readonly yaw?: number;
  readonly goal?: string;
  readonly arrived?: string;
}

const say = (option: string): Action => ({ type: 'dialogue/say', option });
const GO_ON: Action = { type: 'dialogue/go-on' };
const at = (npcs: Record<string, { feet: number[]; yaw: number; arrived?: string }>): Action => ({
  type: 'world/npcs-at',
  space: 'square',
  npcs,
});

function played(open: Opened) {
  const play = startPlay(open.setup, 'square');
  const take = (action: Action) => {
    // As the page sends it: a button's and the stage's, through act's guard.
    const step = play.act(action);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    return step;
  };
  const npcs = () => (play.state.world as { npcs: Record<string, Npc> }).npcs;
  const goals = () => Object.fromEntries(Object.entries(npcs()).map(([actor, npc]) => [actor, npc.goal]));
  return { play, take, npcs, goals };
}

describe('eb with the square', () => {
  it('builds it as format 11, its navmesh and the thirteen actors with their places', async () => {
    const { pack } = await opened();
    expect(pack.format).toBe(11);
    const navmesh = Buffer.from(pack.world?.navmeshes?.square ?? '', 'base64');
    expect(navmesh.subarray(0, 4).toString('latin1')).toBe('EBNV');
    expect(navmesh).toEqual(await readFile(join(SQUARE, 'spaces/square.nav')));
    expect(Object.keys(pack.world?.actors ?? {}).sort()).toEqual(['carter', ...VILLAGERS].sort());
    expect(pack.world?.actors?.carter).toEqual({ space: 'square', path: 'carter' });
  });

  it('sends the carter to the well from their talk, and hears them there once', async () => {
    const { play, take, npcs } = played(await opened());
    take({ type: 'world/use', space: 'square', object: 'carter' });
    take(say('go'));
    expect(npcs().carter).toEqual({ space: 'square', goal: 'well' });
    take(GO_ON);
    expect(play.view.facts['flag.on(flag: watered)']).toBe(false);
    // On the way: where they stand is kept, the goal with it.
    take(at({ carter: { feet: [2.004, 0, -6], yaw: -30 } }));
    expect(npcs().carter).toEqual({ space: 'square', feet: [2, 0, -6], yaw: 330, goal: 'well' });
    const step = take(at({ carter: { feet: [0.4, 0, 7.6], yaw: 0, arrived: 'well' } }));
    expect(step.beats.filter((b) => b.type === 'world/npc-arrived')).toEqual([
      expect.objectContaining({ actor: 'carter', at: 'well' }),
    ]);
    expect(npcs().carter).toEqual({ space: 'square', feet: [0.4, 0, 7.6], yaw: 0, arrived: 'well' });
    expect(play.view.facts['flag.on(flag: watered)']).toBe(true);
    // Said again, an arrival with no goal is a stand: no second event.
    const again = take(at({ carter: { feet: [0.4, 0, 7.6], yaw: 0, arrived: 'well' } }));
    expect(again.beats.filter((b) => b.type === 'world/npc-arrived')).toEqual([]);
  });

  it('sends the twelve villagers off as the market’s zone is entered, and each on as they arrive', async () => {
    const { play, take, goals } = played(await opened());
    expect(goals()).toEqual({});
    take({ type: 'world/trigger', space: 'square', object: 'market' });
    expect(goals()).toEqual(Object.fromEntries(VILLAGERS.map((v, i) => [v, `${v}-${i < 6 ? 'south' : 'north'}`])));
    // The zone goes off once.
    expect(play.act({ type: 'world/trigger', space: 'square', object: 'market' }).accepted).toBe(false);
    // Ash and Lin reach their marks together: the sheet sends each back the other way.
    take(
      at({
        ash: { feet: [11, 0, -9], yaw: 180, arrived: 'ash-south' },
        lin: { feet: [11, 0, 15], yaw: 0, arrived: 'lin-north' },
      }),
    );
    expect(goals()).toMatchObject({ ash: 'ash-north', lin: 'lin-south', bea: 'bea-south' });
    // An arrival at an old goal is the stage a step behind: kept as a stand, not heard.
    const late = take(at({ ash: { feet: [10, 0, -8], yaw: 0, arrived: 'ash-south' } }));
    expect(late.beats.filter((b) => b.type === 'world/npc-arrived')).toEqual([]);
    expect(goals().ash).toBe('ash-north');
  });

  it('refuses a stand for an NPC of no space here, and one that isn’t a stand', async () => {
    const { play } = played(await opened());
    expect(play.act(at({ smith: { feet: [0, 0, 0], yaw: 0 } })).accepted).toBe(false);
    expect(play.act(at({ carter: { feet: [0, 0], yaw: 0 } })).accepted).toBe(false);
    expect(play.act({ ...at({ carter: { feet: [0, 0, 0], yaw: 0 } }), space: 'inn' }).accepted).toBe(false);
  });

  it('saves each NPC where it stood, its goal with it, and a load gives them back', async () => {
    const open = await opened();
    const { play, take, npcs } = played(open);
    take({ type: 'world/trigger', space: 'square', object: 'market' });
    take(at({ ash: { feet: [3.25, 0, 1.5], yaw: 120 }, bea: { feet: [-4, 0, 6], yaw: 200 } }));
    const file = saveOf(open, play, { edition: 'test' }, 1000);
    const resumed = resumeFrom(open, JSON.stringify(file));
    if (!resumed.ok) throw new Error(resumed.message);
    const back = (resumed.play.state.world as { npcs: Record<string, Npc> }).npcs;
    expect(back).toEqual(npcs());
    expect(back.ash).toEqual({ space: 'square', feet: [3.25, 0, 1.5], yaw: 120, goal: 'ash-south' });
  });
});

describe('the square broken', () => {
  async function broken(change: (folder: string) => Promise<void>) {
    const folder = await mkdtemp(join(tmpdir(), 'square-'));
    try {
      await cp(SQUARE, folder, { recursive: true });
      await change(folder);
      const compiled = await compileWithGame(folderSource(folder));
      return compiled.diagnostics.map((d) => [d.code, d.file, d.path]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
  const edit = async (folder: string, file: string, change: (value: Record<string, unknown>) => void) => {
    const path = join(folder, file);
    const value = JSON.parse(await readFile(path, 'utf8'));
    change(value);
    await writeFile(path, JSON.stringify(value));
  };

  it('is W147 once a stall has moved since the bake', async () => {
    const found = await broken((folder) =>
      edit(folder, 'spaces/square.json', (space) => {
        const stall = (space.objects as { id: string; at: number[] }[]).find((o) => o.id === 'stall-1');
        if (stall) stall.at = [-7, 0, 4];
      }),
    );
    expect(found).toEqual([['W147', 'spaces/square.nav', '']]);
  });

  it('is E078 for a .nav that isn’t one', async () => {
    const found = await broken((folder) => writeFile(join(folder, 'spaces/square.nav'), 'EBNV\u0001 not a navmesh'));
    expect(found).toEqual([['E078', 'spaces/square.nav', '']]);
  });

  it('is E079 for a walk-to whose object the space lacks, at its field', async () => {
    const found = await broken((folder) =>
      edit(folder, 'records/talk/carter.json', (talk) => {
        const lines = talk.lines as { options?: { effects?: { to?: string }[] }[] }[];
        const effect = lines[0]?.options?.[0]?.effects?.[0];
        if (effect) effect.to = 'pump';
      }),
    );
    expect(found).toEqual([['E079', 'records/talk/carter.json', '/lines/0/options/0/effects/0/to']]);
  });
});
