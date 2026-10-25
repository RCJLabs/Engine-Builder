/**
 * The ai kit's module (M6.3, D75, docs/specs/ai.md#behaviours), over the village: each NPC's leaf at
 * each hour, the goals it gives the world module, arrivals finishing travel and starting dwells,
 * a sandbox drawn from the NPC's own stream, an in-order going on and staying at its last, cooldowns,
 * @self, and a save loaded to the same leaf.
 */
import { describe, expect, it } from 'vitest';
import { BEHAVIOURS, RECORDS, villageWith } from '../../test/village.ts';

// 06:00, before the smith's work begins.
const v = villageWith(RECORDS, { tick: 6 * 60 });

describe('awareness in the village', () => {
  it('climbs with each sighting and noise, and quiet takes it down, a level said as it changes', () => {
    let state = v.start();
    const far = v.sensed(state, { smith: { seen: [1500] } });
    // At the edge of the smith's 15 m: 2.
    expect(v.fact(far.state, 'ai.awareness', { actor: 'smith' })).toBe(2);
    const loud = v.sensed(state, { smith: { heard: 5 } });
    expect(v.fact(loud.state, 'ai.awareness', { actor: 'smith' })).toBe(100);
    expect(loud.beats).toContainEqual(expect.objectContaining({ type: 'ai/aware', actor: 'smith', level: 'alerted' }));
    state = v.sensed(loud.state, {}, 2000).state;
    expect(v.fact(state, 'ai.awareness', { actor: 'smith' })).toBe(90);
    // Only the player's space's NPCs: the crier, in the inn, is never stirred or calmed here.
    expect(v.ai(state).aware).toEqual({ smith: 90 });
  });

  it('refuses a report from a space the player isn’t in, of an NPC not there, or of no time', () => {
    const state = v.start();
    const refused = (action: Record<string, unknown>) =>
      v.game.reduce(state, { type: 'ai/sensed', space: 'green', ms: 1000, npcs: {}, ...action }, v.sim).accepted;
    expect(refused({ space: 'inn' })).toBe(false);
    expect(refused({ npcs: { crier: { heard: 1 } } })).toBe(false);
    expect(refused({ npcs: { smith: { seen: [-1] } } })).toBe(false);
    expect(refused({ ms: 0 })).toBe(false);
    expect(refused({ ms: 2001 })).toBe(false);
    expect(refused({})).toBe(true);
    // Never on offer: only the stage has something to report.
    expect(v.game.options(state, v.sim).some((a) => a.type === 'ai/sensed')).toBe(false);
  });
});

describe('behaviours in the village', () => {
  it('starts each NPC on the leaf that holds as a new game begins, and sends it there', () => {
    const state = v.start();
    expect(v.fact(state, 'ai.doing', { actor: 'smith' })).toBe('sandbox');
    expect(v.fact(state, 'ai.doing', { actor: 'guard' })).toBe('travel');
    expect(v.fact(state, 'ai.doing', { actor: 'dog' })).toBe('follow');
    expect(v.npcs(state).guard).toEqual({ space: 'green', goal: 'gate' });
    expect(v.npcs(state).dog).toEqual({ space: 'green', follow: 3 });
    // The smith's first point is drawn from their own stream: one of the green's three.
    expect(['bench', 'well', 'stall']).toContain(v.npcs(state).smith?.goal);
    // An actor placed nowhere runs nothing: it has nothing to walk.
    expect(v.ai(state).npcs.stranger).toBeUndefined();
  });

  it('follows the hours: the smith to the forge at 08:00, to bed at 22:00, wandering between', () => {
    let state = v.start();
    state = v.pass(state, 2 * 60);
    expect(v.fact(state, 'ai.doing', { actor: 'smith' })).toBe('work');
    expect(v.npcs(state).smith?.goal).toBe('forge');
    state = v.stand(state, { smith: { arrived: 'forge' } });
    expect(v.ai(state).npcs.smith).toMatchObject({ done: true });
    state = v.pass(state, 10 * 60);
    expect(v.fact(state, 'ai.doing', { actor: 'smith' })).toBe('sandbox');
    state = v.pass(state, 4 * 60);
    expect(v.fact(state, 'ai.doing', { actor: 'smith' })).toBe('sleep');
    expect(v.npcs(state).smith?.goal).toBe('bed');
  });

  it('dwells at each sandbox point, then draws another from the NPC’s own stream, never the same', () => {
    let state = v.start();
    const first = v.npcs(state).smith?.goal as string;
    state = v.stand(state, { smith: { arrived: first } });
    // Ticks count from the game's start, 06:00 here.
    expect(v.ai(state).npcs.smith?.until).toBe(20);
    state = v.pass(state, 19);
    expect(v.npcs(state).smith?.goal).toBeUndefined();
    state = v.pass(state, 1);
    const next = v.npcs(state).smith?.goal;
    expect(['bench', 'well', 'stall']).toContain(next);
    expect(next).not.toBe(first);
    // The same seed draws the same points.
    expect(v.npcs(v.stand(v.start(), { smith: { arrived: first } })).smith).toEqual(
      v.npcs(v.stand(v.start(), { smith: { arrived: first } })).smith,
    );
  });

  it('walks a patrol round in order, waiting at each, by night', () => {
    let state = v.pass(v.start(), 14 * 60);
    expect(v.fact(state, 'ai.doing', { actor: 'guard' })).toBe('patrol');
    expect(v.npcs(state).guard?.goal).toBe('wall-n');
    for (const [at, next] of [
      ['wall-n', 'wall-e'],
      ['wall-e', 'wall-s'],
      ['wall-s', 'wall-n'],
    ]) {
      state = v.stand(state, { guard: { arrived: at } });
      state = v.pass(state, 5);
      expect(v.npcs(state).guard?.goal).toBe(next);
    }
  });

  it('faces a player it is suspicious of and halts one it is alerted to, once, cooling down after', () => {
    let state = v.start();
    state = v.sensed(state, { guard: { heard: 2 } }).state;
    expect(v.fact(state, 'ai.level', { actor: 'guard' })).toBe('suspicious');
    expect(v.fact(state, 'ai.doing', { actor: 'guard' })).toBe('face');
    expect(v.npcs(state).guard).toEqual({ space: 'green', facing: 'player' });
    // Five sightings at arm's length, a second's worth, add 8 each.
    state = v.sensed(state, { guard: { seen: [100, 100, 100, 100, 100] } }).state;
    expect(v.fact(state, 'ai.awareness', { actor: 'guard' })).toBe(40 + 40);
    expect(v.fact(state, 'ai.level', { actor: 'guard' })).toBe('alerted');
    // The in-order faced the player and ran its effects, and stays at its last.
    expect(v.fact(state, 'flag.on', { flag: 'halted' })).toBe(true);
    expect(v.fact(state, 'ai.doing', { actor: 'guard' })).toBe('effects');
    // Quiet takes 5 a second: below 70 the alert's guard is left, and cools down for 30 minutes.
    state = v.sensed(state, {}, 2000).state;
    expect(v.fact(state, 'ai.awareness', { actor: 'guard' })).toBe(70);
    state = v.sensed(state, {}, 1000).state;
    expect(v.fact(state, 'ai.level', { actor: 'guard' })).toBe('suspicious');
    expect(v.ai(state).npcs.guard?.cool).toEqual({ 0: 30 });
  });

  it('goes through an in-order one child after another, and stays at its last', () => {
    const rounds = villageWith({
      ...RECORDS,
      actor: { ...RECORDS.actor, dog: { name: 'Patch', behaviour: 'rounds' } },
    });
    let state = rounds.start();
    expect(rounds.npcs(state).dog).toEqual({ space: 'green', goal: 'well' });
    state = rounds.stand(state, { dog: { arrived: 'well' } });
    expect(rounds.fact(state, 'ai.doing', { actor: 'dog' })).toBe('wait');
    expect(rounds.ai(state).npcs.dog).toMatchObject({ leaf: '1', orders: { '': 1 }, until: 10 });
    state = rounds.pass(state, 10);
    expect(rounds.fact(state, 'ai.doing', { actor: 'dog' })).toBe('travel');
    expect(rounds.npcs(state).dog?.goal).toBe('bench');
    state = rounds.stand(state, { dog: { arrived: 'bench' } });
    state = rounds.pass(state, 60);
    // At its last child, done, it stays there: no loop back to the well.
    expect(rounds.ai(state).npcs.dog).toMatchObject({ leaf: '2', done: true, orders: { '': 2 } });
    expect(rounds.npcs(state).dog).toMatchObject({ arrived: 'bench' });
    expect(rounds.npcs(state).dog?.goal).toBeUndefined();
  });

  it('starts an in-order left for another step from its first child when it holds again', () => {
    const errands = {
      first: [{ hours: [7, 8], do: { wait: { minutes: 30 } } }, BEHAVIOURS.rounds.do],
    };
    const records = {
      ...RECORDS,
      actor: { ...RECORDS.actor, dog: { name: 'Patch', behaviour: 'errands' } },
      behaviour: { ...RECORDS.behaviour, errands: { do: errands } },
    };
    const day = villageWith(records, { tick: 6 * 60 });
    let state = day.stand(day.start(), { dog: { arrived: 'well' } });
    state = day.stand(day.pass(state, 10), { dog: { arrived: 'bench' } });
    expect(day.ai(state).npcs.dog).toMatchObject({ leaf: '1.2', done: true, orders: { 1: 2 } });
    // 07:00: the hours hold, and the errands are left part done.
    state = day.pass(state, 50);
    expect(day.fact(state, 'ai.doing', { actor: 'dog' })).toBe('wait');
    expect(day.ai(state).npcs.dog?.orders).toBeUndefined();
    // 08:00: back to the errands, from the well again rather than the bench it reached.
    state = day.pass(state, 60);
    expect(day.ai(state).npcs.dog).toMatchObject({ leaf: '1.0' });
    expect(day.npcs(state).dog?.goal).toBe('well');
  });

  it('runs a step’s effects with @self as the NPC running them', () => {
    const records = {
      ...RECORDS,
      actor: { ...RECORDS.actor, dog: { name: 'Patch', behaviour: 'fetch' } },
      behaviour: {
        ...RECORDS.behaviour,
        fetch: { do: { effects: [{ effect: 'walk-to', actor: '@self', to: 'bench' }] } },
      },
    };
    const fetch = villageWith(records);
    const state = fetch.start();
    expect(fetch.fact(state, 'ai.doing', { actor: 'dog' })).toBe('effects');
    expect(fetch.npcs(state).dog?.goal).toBe('bench');
  });

  it('stops an NPC where it is when nothing holds, and says so', () => {
    const records = {
      ...RECORDS,
      behaviour: { ...RECORDS.behaviour, heel: { do: { hours: [12, 13], do: { follow: 'player' } } } },
    };
    const noon = villageWith(records, { tick: 12 * 60 });
    let state = noon.start();
    expect(noon.npcs(state).dog).toEqual({ space: 'green', follow: 2 });
    const step = noon.take(state, { type: 'time/advance', minutes: 60 });
    state = step.state;
    expect(noon.fact(state, 'ai.doing', { actor: 'dog' })).toBeUndefined();
    expect(noon.npcs(state).dog).toEqual({ space: 'green' });
    expect(step.beats).toContainEqual(expect.objectContaining({ type: 'ai/doing', actor: 'dog', doing: 'nothing' }));
  });

  it('keeps every NPC’s run in the state, which a save carries and loads as it was', () => {
    let state = v.pass(v.start(), 14 * 60);
    state = v.stand(state, { guard: { arrived: 'wall-n' } });
    const { state: back, report } = v.game.migrate(JSON.parse(JSON.stringify(state)), v.sim);
    expect(report.migrated).toEqual([]);
    expect(back.ai).toEqual(state.ai);
    expect(v.fact(back, 'ai.doing', { actor: 'guard' })).toBe('patrol');
    expect(v.npcs(v.pass(back, 5)).guard?.goal).toBe('wall-e');
  });
});
