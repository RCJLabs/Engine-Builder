/**
 * eb with the village (M6.3's gate, D75, docs/specs/ai.md#the-gate): a smith who keeps the forge by
 * day, the cottage by night and the green between, and a guard who keeps the gate by day and walks
 * the walls by night, facing a player they are suspicious of and halting one they are alerted to.
 * eb builds it as format 12 with its clock; played through the session as the stage would play it,
 * each NPC does what its hours say at each hour of a day, arrivals come from the test's walker, the
 * clock runs on time/elapse, ai/sensed raises the guard to a halt, and a save mid-patrol loads to
 * the same step. A clock that can't run, a point the space lacks, a behaviour no actor has and a
 * calendar the default clock can't run each break it.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import type { Action } from '@eb/core';
import { type Opened, openPack, resumeFrom, saveOf, startPlay } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const VILLAGE = resolve(import.meta.dirname, 'fixtures/village');

async function opened(): Promise<Opened> {
  const compiled = await compileWithGame(folderSource(VILLAGE));
  expect(compiled.diagnostics).toEqual([]);
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  return open.opened;
}

interface Npc {
  readonly goal?: string;
  readonly arrived?: string;
  readonly facing?: string;
}

function played(open: Opened) {
  const play = startPlay(open.setup, 'village');
  const take = (action: Action) => {
    const step = play.act(action);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    return step;
  };
  const npcs = () => (play.state.world as { npcs: Record<string, Npc> }).npcs;
  const doing = (actor: string) => play.view.facts[`ai.doing(actor: ${actor})`];
  const clock = () => play.view.facts['time.clock'];
  /** The test's walker: each NPC with a goal gets there, as the crowd would. */
  const walk = () => {
    for (const [actor, npc] of Object.entries(npcs())) {
      if (npc.goal === undefined) continue;
      take({
        type: 'world/npcs-at',
        space: 'village',
        npcs: { [actor]: { feet: [0, 0, 0], yaw: 0, arrived: npc.goal } },
      });
    }
  };
  /** Game minutes passed as the stage passes them: time/elapse, 1.5 s at a time (a minute is 3 s at 20x), walked as they go. */
  const pass = (minutes: number) => {
    for (let i = 0; i < minutes * 2; i++) {
      take({ type: 'time/elapse', ms: 1500 });
      if (i % 20 === 19) walk();
    }
  };
  return { play, take, npcs, doing, clock, walk, pass };
}

const sensed = (npcs: Record<string, { seen?: number[]; heard?: number }>, ms = 1000): Action => ({
  type: 'ai/sensed',
  space: 'village',
  ms,
  npcs,
});

describe('eb with the village', () => {
  it('builds it as format 12, the clock at its default, the navmesh and both actors', async () => {
    const { pack } = await opened();
    expect(pack.format).toBe(12);
    expect(pack.project.clock).toEqual({ rate: 20 });
    expect(Buffer.from(pack.world?.navmeshes?.village ?? '', 'base64')).toEqual(
      await readFile(join(VILLAGE, 'spaces/village.nav')),
    );
    expect(Object.keys(pack.world?.actors ?? {}).sort()).toEqual(['guard', 'smith']);
    expect(Object.keys(pack.records.behaviour ?? {}).sort()).toEqual(['guards-watch', 'smiths-day']);
  });

  it('runs the clock on the walk’s time, a game minute every three real seconds', async () => {
    const { take, clock } = played(await opened());
    expect(clock()).toBe('10:00');
    for (let i = 0; i < 4; i++) take({ type: 'time/elapse', ms: 1500 });
    expect(clock()).toBe('10:02');
    take({ type: 'village/wait' });
    expect(clock()).toBe('22:02');
  });

  it('has each NPC doing what its hours say, at each hour of a whole day', async () => {
    const { doing, clock, walk, npcs, pass } = played(await opened());
    const day: string[] = [];
    for (let hour = 0; hour < 24; hour++) {
      day.push(`${clock()} ${doing('smith')} ${doing('guard')}`);
      pass(60);
    }
    expect(day).toEqual([
      ...[10, 11, 12, 13, 14, 15, 16, 17].map((h) => `${h}:00 work work`),
      ...[18, 19].map((h) => `${h}:00 sandbox work`),
      ...[20, 21].map((h) => `${h}:00 sandbox patrol`),
      ...[22, 23].map((h) => `${h}:00 sleep patrol`),
      ...[0, 1, 2, 3, 4, 5].map((h) => `0${h}:00 sleep patrol`),
      ...[6, 7].map((h) => `0${h}:00 sandbox work`),
      ...[8, 9].map((h) => `0${h}:00 work work`),
    ]);
    // At the end of the day each stands where its hours put it.
    walk();
    expect(npcs().smith?.arrived).toBe('anvil');
    expect(npcs().guard?.arrived).toBe('gate');
  });

  it('walks the guard round the walls point by point, waiting five minutes at each', async () => {
    const { take, npcs, walk, pass } = played(await opened());
    take({ type: 'village/wait' });
    expect(npcs().guard?.goal).toBe('wall-ne');
    walk();
    expect(npcs().guard?.goal).toBeUndefined();
    expect(npcs().guard?.arrived).toBe('wall-ne');
    take({ type: 'time/elapse', ms: 1500 });
    pass(4);
    expect(npcs().guard?.goal).toBeUndefined();
    pass(1);
    expect(npcs().guard?.goal).toBe('wall-se');
  });

  it('turns the guard to a player heard running past, and halts one walking up to them', async () => {
    const { play, take, npcs, doing } = played(await opened());
    take(sensed({ guard: { heard: 1 } }));
    take(sensed({ guard: { heard: 1 } }));
    expect(play.view.facts['ai.level(actor: guard)']).toBe('suspicious');
    expect((play.state.ai as { aware: Record<string, number> }).aware.guard).toBe(40);
    expect(doing('guard')).toBe('face');
    expect(npcs().guard?.facing).toBe('player');
    // Seen close, five looks a second: alerted, faced and halted with the talk.
    take(sensed({ guard: { seen: [300, 300, 300, 300, 300] } }));
    expect(play.view.modes.at(-1)).toBe('talking');
    expect(play.view.fields['talk.text']).toBe("Halt. You're walking about like you own the place.");
  });

  it('saves the guard mid-patrol, and a load picks the patrol up at the same point', async () => {
    const open = await opened();
    const { play, take, walk, pass } = played(open);
    take({ type: 'village/wait' });
    walk();
    pass(5);
    const before = play.state.ai;
    const file = saveOf(open, play, { edition: 'test' }, 1000);
    const resumed = resumeFrom(open, JSON.stringify(file));
    if (!resumed.ok) throw new Error(resumed.message);
    expect(resumed.play.state.ai).toEqual(before);
    expect((resumed.play.state.world as { npcs: Record<string, Npc> }).npcs.guard?.goal).toBe('wall-se');
    expect(resumed.play.view.facts['ai.doing(actor: guard)']).toBe('patrol');
  });

  it('loads a save made by the world module’s version 4 (M6.4), the guard facing the player as it was', async () => {
    const open = await opened();
    const raw = await readFile(resolve(import.meta.dirname, 'fixtures/saves/village-world-v4.json'), 'utf8');
    const resumed = resumeFrom(open, raw);
    if (!resumed.ok) throw new Error(resumed.message);
    expect(resumed.report.migrated).toEqual([{ module: 'world', from: 4, to: 5 }]);
    const npcs = (resumed.play.state.world as { npcs: Record<string, Npc> }).npcs;
    expect(npcs.guard).toMatchObject({ facing: 'player' });
    expect(resumed.play.view.facts['ai.level(actor: guard)']).toBe('suspicious');
  });
});

describe('the village broken', () => {
  async function broken(change: (folder: string) => Promise<void>) {
    const folder = await mkdtemp(join(tmpdir(), 'village-'));
    try {
      await cp(VILLAGE, folder, { recursive: true });
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

  it('is E080 for a clock whose ticks aren’t whole milliseconds', async () => {
    const found = await broken((folder) =>
      edit(folder, 'project.json', (p) => Object.assign(p, { clock: { rate: 7 } })),
    );
    expect(found).toEqual([['E080', 'project.json', '/clock/rate']]);
  });

  it('is W149 for a calendar the default clock can’t run', async () => {
    const found = await broken((folder) =>
      edit(folder, 'project.json', (p) =>
        Object.assign(p, { calendar: { ...(p.calendar as object), ticksPerDay: 1441 } }),
      ),
    );
    expect(found).toContainEqual(['W149', 'project.json', '']);
  });

  it('is E081 for a point the guard’s space lacks', async () => {
    const found = await broken((folder) =>
      edit(folder, 'records/behaviour/guards-watch.json', (b) => {
        const first = (b.do as { first: { do: Record<string, unknown> }[] }).first;
        if (first[3]) first[3].do = { work: 'tower' };
      }),
    );
    expect(found).toEqual([['E081', 'records/behaviour/guards-watch.json', '/do/first/3/do/work']]);
  });

  it('is W148 for a behaviour no actor has', async () => {
    const found = await broken((folder) =>
      edit(folder, 'records/actor/smith.json', (actor) => {
        delete actor.behaviour;
      }),
    );
    expect(found).toEqual([['W148', 'records/behaviour/smiths-day.json', '']]);
  });
});
