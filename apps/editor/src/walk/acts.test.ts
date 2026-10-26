/**
 * The walk's M5.9 parts as plain functions (D71, docs/specs/worldspaces.md): what the player faces,
 * the outbox that sends one step at a time, when to say where the player stands, what a take takes,
 * and the spawn point arrived at; and the acts that tie them to the prompt.
 */
import type { Action } from '@eb/core';
import type { Sent, SpaceAsk } from '@eb/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActs } from './acts.ts';
import { CONE, facing, forwardOf, REACH } from './interact.ts';
import { createOutbox, RETRY_MS, TRIES } from './outbox.ts';
import type { Prompt } from './prompt.ts';
import { createSender } from './sender.ts';
import { isTaken, type Spawn, spawnOf, type UsePoint } from './solids.ts';
import { dueAt, EVERY_MS, MOVED_M, standing } from './stood.ts';

// The body's middle is 0.9 m over the feet: these stand at its height.
const use = (path: string, at: [number, number]): UsePoint => ({ path, center: [at[0], 0.9, at[1]], label: path });

describe('facing', () => {
  it('turns a yaw to the way it faces over the ground: 0 along −z, 90 along −x', () => {
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - (b[i] as number)) < 1e-9);
    expect(near(forwardOf(0), [0, -1])).toBe(true);
    expect(near(forwardOf(90), [-1, 0])).toBe(true);
    expect(near(forwardOf(180), [0, 1])).toBe(true);
  });

  it('finds the nearest use in reach and in the cone, and none behind, too far or taken', () => {
    const uses = [use('far', [0, -REACH - 0.1]), use('rope', [0, -1.5]), use('lamp', [0, -1]), use('back', [0, 1])];
    expect(facing(uses, [0, 0, 0], 0, new Set())?.path).toBe('lamp');
    expect(facing(uses, [0, 0, 0], 0, new Set(['lamp']))?.path).toBe('rope');
    expect(facing(uses, [0, 0, 0], 180, new Set())?.path).toBe('back');
    expect(facing([use('far', [0, -REACH - 0.1])], [0, 0, 0], 0, new Set())).toBeUndefined();
  });

  it('puts one spent behind any other in reach, nearest first among each (M6.4)', () => {
    const searched = { ...use('rook', [0, -0.5]), spent: true as const };
    const crow = use('crow', [0, -1.5]);
    expect(facing([searched, crow], [0, 0, 0], 0, new Set())?.path).toBe('crow');
    expect(facing([crow, searched], [0, 0, 0], 0, new Set())?.path).toBe('crow');
    expect(facing([searched, { ...crow, spent: true }], [0, 0, 0], 0, new Set())?.path).toBe('rook');
    expect(facing([searched], [0, 0, 0], 0, new Set())?.path).toBe('rook');
  });

  it('keeps the cone to CONE degrees either side', () => {
    const at = (deg: number): UsePoint => {
      const r = (deg * Math.PI) / 180;
      return use('side', [-Math.sin(r), -Math.cos(r)]);
    };
    expect(facing([at(CONE - 1)], [0, 0, 0], 0, new Set())).toBeDefined();
    expect(facing([at(CONE + 1)], [0, 0, 0], 0, new Set())).toBeUndefined();
    expect(facing([at(-(CONE - 1))], [0, 0, 0], 0, new Set())).toBeDefined();
  });

  it('measures from the body’s middle: a thing on the floor at the feet is in reach, one 2 m overhead is not', () => {
    const floor: UsePoint = { path: 'floor', center: [0, 0.1, -1.6], label: 'Take' };
    const high: UsePoint = { path: 'high', center: [0, 3, -0.5], label: 'Take' };
    expect(facing([floor], [0, 0, 0], 0, new Set())?.path).toBe('floor');
    expect(facing([high], [0, 0, 0], 0, new Set())).toBeUndefined();
    // On a shelf at chest height, 1.9 m away: in reach from the middle, though 2.3 m from the feet.
    const shelf: UsePoint = { path: 'shelf', center: [0, 1.3, -1.9], label: 'Take' };
    expect(facing([shelf], [0, 0, 0], 0, new Set())?.path).toBe('shelf');
  });
});

describe('isTaken', () => {
  it('takes the object and everything inside it, and nothing named like it', () => {
    const taken = new Set(['shelf/rope']);
    expect(isTaken('shelf/rope', taken)).toBe(true);
    expect(isTaken('shelf/rope/coil', taken)).toBe(true);
    expect(isTaken('shelf', taken)).toBe(false);
    expect(isTaken('shelf/ropes', taken)).toBe(false);
    expect(isTaken('rope', taken)).toBe(false);
  });
});

describe('spawnOf', () => {
  const spawn = (path: string, start = false): Spawn => ({ path, at: [0, 0, 0], yaw: 0, start, view: 'third' });
  it('arrives at the spawn point named, else the start, else the first', () => {
    const spawns = [spawn('a'), spawn('b', true), spawn('c')];
    expect(spawnOf(spawns, 'c')?.path).toBe('c');
    expect(spawnOf(spawns, 'gone')?.path).toBe('b');
    expect(spawnOf(spawns)?.path).toBe('b');
    expect(spawnOf([spawn('a'), spawn('c')])?.path).toBe('a');
  });
});

describe('stood', () => {
  it('is due every 5 s once the player has moved 0.5 m, and not before either', () => {
    const last = { feet: [0, 0, 0] as [number, number, number], time: 1000 };
    expect(dueAt(last, [MOVED_M, 0, 0], 1000 + EVERY_MS)).toBe(true);
    expect(dueAt(last, [MOVED_M - 0.01, 0, 0], 1000 + EVERY_MS * 3)).toBe(false);
    expect(dueAt(last, [5, 0, 0], 1000 + EVERY_MS - 1)).toBe(false);
  });

  it('sends the feet to the centimetre and the yaw to the tenth of a degree, in 0 to 360', () => {
    expect(standing('glen', [1.234, 0.005, -2.996], -90.04)).toEqual({
      type: 'world/at',
      space: 'glen',
      feet: [1.23, 0.01, -3],
      yaw: 270,
    });
    expect(standing('glen', [0, 0, 0], 359.99).yaw).toBe(0);
    expect(standing('glen', [0, 0, 0], 725).yaw).toBe(5);
  });
});

describe('the outbox', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A send that answers when told, as the shell's step does. */
  function sender() {
    const asked: { action: Action; answer: (sent: Sent) => void }[] = [];
    const send = (action: Action) => new Promise<Sent>((answer) => asked.push({ action, answer }));
    return { asked, send };
  }

  it('sends one at a time, in order, and answers each', async () => {
    const { asked, send } = sender();
    const box = createOutbox(send);
    const first = box.post({ type: 'world/at', space: 'glen', feet: [0, 0, 0], yaw: 0 });
    const second = box.post({ type: 'world/use', space: 'glen', object: 'rope' });
    box.pump();
    box.pump();
    expect(asked.map((a) => a.action.type)).toEqual(['world/at']);
    asked[0]?.answer('accepted');
    expect(await first).toBe('accepted');
    expect(asked.map((a) => a.action.type)).toEqual(['world/at', 'world/use']);
    asked[1]?.answer('refused');
    expect(await second).toBe('refused');
    expect(box.size).toBe(0);
  });

  it('tries a dropped one again by a timer, and gives up after TRIES', async () => {
    const { asked, send } = sender();
    const box = createOutbox(send);
    const used = box.post({ type: 'world/use', space: 'glen', object: 'rope' });
    box.pump();
    for (let i = 0; i < TRIES; i++) {
      asked[i]?.answer('dropped');
      await vi.advanceTimersByTimeAsync(RETRY_MS);
    }
    expect(asked).toHaveLength(TRIES);
    expect(await used).toBe('dropped');
  });

  it('keeps only the newest world/at waiting, never the one on its way', async () => {
    const { asked, send } = sender();
    const box = createOutbox(send);
    const at = (x: number) => ({ type: 'world/at', space: 'glen', feet: [x, 0, 0], yaw: 0 });
    const flying = box.post(at(1));
    box.pump();
    const older = box.post(at(2));
    void box.post(at(3));
    expect(await older).toBe('dropped');
    asked[0]?.answer('accepted');
    expect(await flying).toBe('accepted');
    expect(asked.map((a) => (a.action.feet as number[])[0])).toEqual([1, 3]);
  });

  it('sends nothing once closed, and drops what waits', async () => {
    const { asked, send } = sender();
    const box = createOutbox(send);
    const waiting = box.post({ type: 'world/use', space: 'glen', object: 'rope' });
    box.close();
    box.pump();
    expect(await waiting).toBe('dropped');
    expect(asked).toEqual([]);
  });
});

describe('the acts', () => {
  /** A prompt that remembers what it shows, pressed when told. */
  function prompt() {
    let pressed = false;
    const shows: (string | undefined)[] = [];
    const made: Prompt & { press(): void; shows: (string | undefined)[] } = {
      show: (label) => void shows.push(label),
      take: () => {
        const was = pressed;
        pressed = false;
        return was;
      },
      get shown() {
        return shows.at(-1);
      },
      dispose() {},
      press: () => {
        pressed = true;
      },
      shows,
    };
    return made;
  }
  function asked(here = true) {
    const sent: Action[] = [];
    const ask: SpaceAsk = {
      space: 'glen',
      quality: 'auto',
      taken: [],
      here: () => here,
      send: (action) => {
        sent.push(action);
        return Promise.resolve('accepted');
      },
    };
    return { ask, sent };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('uses what the player faces once a press, after saying where they stand', async () => {
    const { ask, sent } = asked();
    const p = prompt();
    const acts = createActs(ask, createOutbox(ask.send), [use('rope', [0, -1])], p, { feet: [0, 0, 0], time: 0 });
    acts.frame([0, 0, 0], 0, true, 'keys', 10);
    acts.frame([0, 0, 0], 0, true, 'keys', 20);
    for (let i = 0; i < 4; i++) {
      await flush();
      acts.frame([0, 0, 0], 0, false, 'keys', 30);
    }
    expect(p.shown).toBe('rope');
    expect(sent).toEqual([
      { type: 'world/at', space: 'glen', feet: [0, 0, 0], yaw: 0 },
      { type: 'world/use', space: 'glen', object: 'rope' },
    ]);
    // Taken, it is offered no more.
    acts.taken(['rope']);
    acts.frame([0, 0, 0], 0, false, 'keys', 40);
    expect(p.shown).toBeUndefined();
    expect(acts.prompt()).toBeNull();
  });

  it('uses by the prompt pressed, as a tap on a phone', async () => {
    const { ask, sent } = asked();
    const p = prompt();
    const acts = createActs(ask, createOutbox(ask.send), [use('rope', [0, -1])], p, { feet: [0, 0, 0], time: 0 });
    acts.frame([0, 0, 0], 0, false, 'touch', 10);
    p.press();
    acts.frame([0, 0, 0], 0, false, 'touch', 20);
    for (let i = 0; i < 4; i++) {
      await flush();
      acts.frame([0, 0, 0], 0, false, 'touch', 30);
    }
    expect(sent.map((a) => a.type)).toEqual(['world/at', 'world/use']);
  });

  it('tells the stage of each use, and says no stand again that a use has just said (M6.1)', async () => {
    const { ask, sent } = asked();
    const turned: [string, readonly number[]][] = [];
    const acts = createActs(
      ask,
      createOutbox(ask.send),
      [use('smith', [0, -1])],
      prompt(),
      { feet: [0, 0, 0], time: 0 },
      (path, feet) => void turned.push([path, feet]),
    );
    acts.frame([0, 0, 0], 0, true, 'keys', 10);
    expect(turned).toEqual([['smith', [0, 0, 0]]]);
    // The talk opens and pauses the walk, which says where the player stands: it has, just now.
    acts.stand([0, 0, 0], 0, 20);
    acts.stand([0, 0, 0.001], 0.01, 30);
    for (let i = 0; i < 4; i++) {
      await flush();
      acts.frame([0, 0, 0], 0, false, 'keys', 40);
    }
    expect(sent.map((a) => a.type)).toEqual(['world/at', 'world/use']);
    acts.stand([2, 0, 0], 0, 50);
    await flush();
    expect(sent.at(-1)).toEqual({ type: 'world/at', space: 'glen', feet: [2, 0, 0], yaw: 0 });
  });

  it('says where the player stands when due, and nothing in a space the sim hasn’t them in', async () => {
    const here = asked();
    const acts = createActs(here.ask, createOutbox(here.ask.send), [], prompt(), { feet: [0, 0, 0], time: 0 });
    acts.frame([0.2, 0, 0], 0, false, 'keys', EVERY_MS);
    acts.frame([1, 0, 0], 0, false, 'keys', EVERY_MS);
    await flush();
    expect(here.sent).toEqual([{ type: 'world/at', space: 'glen', feet: [1, 0, 0], yaw: 0 }]);
    const elsewhere = asked(false);
    const away = createActs(elsewhere.ask, createOutbox(elsewhere.ask.send), [], prompt(), {
      feet: [0, 0, 0],
      time: 0,
    });
    away.frame([3, 0, 0], 0, false, 'keys', EVERY_MS);
    away.stand([3, 0, 0], 0, EVERY_MS);
    await flush();
    expect(elsewhere.sent).toEqual([]);
  });
});

describe('the zones and the stands together', () => {
  it('sends a zone entered behind a world/at on its way, once, as the shell drops one sent beside another', async () => {
    // The shell as it is: a step asked for while one is on its way is dropped.
    const asked: { action: Action; answer: (sent: Sent) => void }[] = [];
    let busy = false;
    const send = (action: Action) => {
      if (busy) return Promise.resolve<Sent>('dropped');
      busy = true;
      return new Promise<Sent>((answer) =>
        asked.push({
          action,
          answer: (sent) => {
            busy = false;
            answer(sent);
          },
        }),
      );
    };
    const outbox = createOutbox(send);
    const zone = { kind: 'ball', path: 'cairn/zone', center: [0, 1, 0], radius: 2 } as const;
    const sender = createSender('trail', outbox, [zone]);
    void outbox.post({ type: 'world/at', space: 'trail', feet: [0, 0, 0], yaw: 0 });
    outbox.pump();
    sender.step([0, 0, 0]);
    outbox.pump();
    await new Promise((r) => setTimeout(r, 0));
    asked[0]?.answer('accepted');
    await new Promise((r) => setTimeout(r, 0));
    asked[1]?.answer('accepted');
    await new Promise((r) => setTimeout(r, 0));
    expect(asked.map((a) => a.action.type)).toEqual(['world/at', 'world/trigger']);
    expect(sender.sent()).toEqual([{ object: 'cairn/zone', sent: 'accepted' }]);
  });
});
