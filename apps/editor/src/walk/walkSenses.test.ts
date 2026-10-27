/**
 * The senses in a walk (M6.3, D75): which NPCs of a space sense, from their actor records, and the
 * player's noises read off the walk's intent: running on the ground, landing from a fall (not a step
 * down), Interact pressed (not held), sent once a second through the outbox while the walk runs.
 */
import type { Action, PackWorld } from '@eb/core';
import { CONE_DEG, HEARING_M, SENSED_MOST, SIGHT_M } from '@eb/kits';
import type { Sent } from '@eb/ui';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../spaces/vec.ts';
import type { Intent } from './controls.ts';
import type { Outbox } from './outbox.ts';
import type { Standing } from './senses.ts';
import { createWalkSenses, mergeSensed, sensersIn } from './walkSenses.ts';
import type { WalkSpace } from './world.ts';

const world = {
  actors: {
    guard: { space: 'green', path: 'guard' },
    smith: { space: 'green', path: 'yard/smith' },
    crier: { space: 'inn', path: 'crier' },
    drover: { space: 'green', path: 'drover' },
  },
  records: {
    'actor:guard': { name: 'Bram', behaviour: 'watch', sight: 20, hearing: 0 },
    'actor:smith': { name: 'Ada', behaviour: 'smiths-day' },
    'actor:crier': { name: 'Col', behaviour: 'rounds' },
    'actor:drover': { name: 'Dee' },
  },
} as unknown as PackWorld;
const space = {
  id: 'green',
  npcs: (key: string) => (key === 'actor:guard' ? { height: 2 } : null),
} as unknown as WalkSpace;
const still: Intent = { move: [0, 0], run: false, jump: false, use: false, attack: false, look: [0, 0] };

describe('sensersIn', () => {
  it('senses with each NPC of the space that has a behaviour, its own senses or the kit’s', () => {
    expect(
      sensersIn(world, space).map(({ actor, path, sight, cone, hearing, height }) => ({
        actor,
        path,
        sight,
        cone,
        hearing,
        height,
      })),
    ).toEqual([
      { actor: 'guard', path: 'guard', sight: 20, cone: CONE_DEG, hearing: 0, height: 2 },
      {
        actor: 'smith',
        path: 'yard/smith',
        sight: SIGHT_M,
        cone: CONE_DEG,
        hearing: HEARING_M,
        height: expect.any(Number),
      },
    ]);
  });
});

describe('mergeSensed', () => {
  const report = (ms: number, npcs: Record<string, object>): Action => ({
    type: 'ai/sensed',
    space: 'green',
    ms,
    npcs,
  });

  it('adds the time and joins each NPC’s sightings and noises, within what the sim takes', () => {
    const older = report(1000, { guard: { seen: [300, 250] }, smith: { heard: 1 } });
    const newer = report(1000, { guard: { seen: [200], heard: 1 } });
    expect(mergeSensed(older, newer)).toEqual(
      report(2000, { guard: { seen: [300, 250, 200], heard: 1 }, smith: { heard: 1 } }),
    );
    const many = (n: number) => Array.from({ length: n }, (_, i) => 100 + i);
    const full = mergeSensed(
      report(1500, { guard: { seen: many(10), heard: 15 } }),
      report(1500, { guard: { seen: many(10), heard: 15 } }),
    );
    expect(full.ms).toBe(SENSED_MOST.ms);
    const guard = (full.npcs as Record<string, { seen: number[]; heard: number }>).guard;
    expect(guard?.seen).toHaveLength(SENSED_MOST.sightings);
    expect(guard?.seen.at(-1)).toBe(109);
    expect(guard?.heard).toBe(SENSED_MOST.noises);
  });
});

describe('a walk’s senses', () => {
  const walked = (running = () => true) => {
    const posted: Action[] = [];
    const outbox: Outbox = {
      post: (action) => {
        posted.push(action);
        return Promise.resolve<Sent>('accepted');
      },
      pump: () => {},
      close: () => {},
      size: 0,
    };
    // The smith stands 3 m behind the player, facing away: it hears and doesn't see.
    const built = (): Standing[] => [{ path: 'yard/smith', at: [0, 0, 3], yaw: 0 }];
    const senses = createWalkSenses(space, world, outbox, running, built, () => null);
    if (!senses) throw new Error('No senses');
    return { senses, posted };
  };
  const feet: Vec3 = [0, 0, 0];
  const heardBy = (posted: Action[]) =>
    posted.map((a) => (a.npcs as Record<string, { heard?: number }>).smith?.heard ?? 0);

  it('hears a run on the ground and an Interact pressed, once each a report', async () => {
    const { senses, posted } = walked();
    const running: Intent = { ...still, move: [0, 1], run: true, use: true };
    for (let i = 0; i < 50; i++) senses.frame(20, feet, running, true);
    expect(posted).toHaveLength(1);
    expect(heardBy(posted)).toEqual([2]);
    await Promise.resolve();
    // Run held without moving, or Interact still held: no noise.
    for (let i = 0; i < 50; i++) senses.frame(20, feet, { ...still, run: true, use: true }, true);
    expect(heardBy(posted)).toEqual([2, 0]);
  });

  it('keeps one report waiting at a time, those made meanwhile held as one and sent once it is answered (M7.1)', async () => {
    const posted: Action[] = [];
    const answers: ((sent: Sent) => void)[] = [];
    const outbox: Outbox = {
      post: (action) => {
        posted.push(action);
        return new Promise<Sent>((answer) => answers.push(answer));
      },
      pump: () => {},
      close: () => {},
      size: 0,
    };
    const built = (): Standing[] => [{ path: 'yard/smith', at: [0, 0, 3], yaw: 0 }];
    const senses = createWalkSenses(
      space,
      world,
      outbox,
      () => true,
      built,
      () => null,
    );
    const running: Intent = { ...still, move: [0, 1], run: true };
    for (let second = 0; second < 3; second++) {
      for (let i = 0; i < 50; i++) senses?.frame(20, feet, i === 0 ? still : running, true);
    }
    expect(posted.map((a) => a.ms)).toEqual([1000]);
    answers[0]?.('accepted');
    await Promise.resolve();
    // The second and third seconds as one: their time and the smith's two runs heard.
    expect(posted.map((a) => a.ms)).toEqual([1000, 2000]);
    expect(heardBy(posted)).toEqual([1, 2]);
  });

  it('hears a landing after a fall, and not after a step down', () => {
    const { senses, posted } = walked();
    for (let i = 0; i < 10; i++) senses.frame(20, feet, still, false);
    senses.frame(20, feet, still, true);
    for (let i = 0; i < 20; i++) senses.frame(20, feet, still, false);
    senses.frame(20, feet, still, true);
    for (let i = 0; i < 18; i++) senses.frame(20, feet, still, true);
    expect(heardBy(posted)).toEqual([1]);
  });

  it('senses nothing while the walk isn’t running, and has no senses where none sense', () => {
    const { senses, posted } = walked(() => false);
    for (let i = 0; i < 100; i++) senses.frame(20, feet, { ...still, move: [0, 1], run: true }, true);
    expect(posted).toEqual([]);
    const inn = { id: 'inn-cellar', npcs: () => null } as unknown as WalkSpace;
    const outbox: Outbox = { post: () => Promise.resolve<Sent>('accepted'), pump: () => {}, close: () => {}, size: 0 };
    expect(
      createWalkSenses(
        inn,
        world,
        outbox,
        () => true,
        () => [],
        () => null,
      ),
    ).toBeNull();
  });
});
