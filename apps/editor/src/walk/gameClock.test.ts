import type { Action } from '@eb/core';
import type { Sent } from '@eb/ui';
import { describe, expect, it } from 'vitest';
import { createGameClock } from './gameClock.ts';
import { createOutbox } from './outbox.ts';

/** An outbox whose sim answers each elapse with the next of `answers`, then accepts. */
function harness(answers: Sent[] = [], running = { on: true }) {
  const sent: Action[] = [];
  const outbox = createOutbox(async (action) => {
    sent.push(action);
    return answers.shift() ?? 'accepted';
  });
  const clock = createGameClock(() => running.on, outbox);
  return { clock, sent, running, settle: () => new Promise((done) => setTimeout(done, 0)) };
}

describe('the game clock in a walk (M6.3)', () => {
  it('tells the sim the time walked once a second, in whole milliseconds, the rest kept', async () => {
    const { clock, sent, settle } = harness();
    clock.frame(400);
    clock.frame(400);
    expect(sent).toEqual([]);
    clock.frame(250.75);
    await settle();
    expect(sent).toEqual([{ type: 'time/elapse', ms: 1050 }]);
    // The fraction short of a millisecond rides on: no time is lost.
    clock.frame(999.5);
    await settle();
    expect(sent.map((a) => a.ms)).toEqual([1050, 1000]);
    expect(clock.hook()).toEqual({
      owed: 0,
      sent: [
        { ms: 1050, sent: 'accepted' },
        { ms: 1000, sent: 'accepted' },
      ],
    });
  });

  it('counts nothing while the game’s mode doesn’t run it, and keeps what it owes', async () => {
    const { clock, sent, running, settle } = harness();
    clock.frame(600);
    running.on = false;
    clock.frame(5000);
    clock.flush();
    await settle();
    expect(sent).toEqual([]);
    running.on = true;
    clock.frame(400);
    await settle();
    expect(sent).toEqual([{ type: 'time/elapse', ms: 1000 }]);
  });

  it('sends what it owes as the walk pauses, short of a second', async () => {
    const { clock, sent, settle } = harness();
    clock.frame(300);
    clock.flush();
    await settle();
    expect(sent).toEqual([{ type: 'time/elapse', ms: 300 }]);
    clock.flush();
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('owes a dropped elapse’s time to the next, and gives up what the sim refused', async () => {
    const answers: Sent[] = [];
    const sent: Action[] = [];
    const posted: { post(action: Action): Promise<Sent>; pump(): void; close(): void; size: number } = {
      post: async (action) => {
        sent.push(action);
        return answers.shift() ?? 'accepted';
      },
      pump() {},
      close() {},
      size: 0,
    };
    const clock = createGameClock(() => true, posted);
    answers.push('dropped');
    clock.frame(1200);
    await new Promise((done) => setTimeout(done, 0));
    expect(clock.hook().owed).toBe(1200);
    clock.frame(0);
    await new Promise((done) => setTimeout(done, 0));
    expect(sent.map((a) => a.ms)).toEqual([1200, 1200]);
    answers.push('refused');
    clock.frame(1000);
    await new Promise((done) => setTimeout(done, 0));
    expect(sent.map((a) => a.ms)).toEqual([1200, 1200, 1000]);
    expect(clock.hook().owed).toBe(0);
  });

  it('sends no more than the sim takes in one elapse, and the rest after', async () => {
    const answers: Sent[] = ['dropped', 'dropped'];
    const sent: Action[] = [];
    const clock = createGameClock(() => true, {
      post: async (action) => {
        sent.push(action);
        return answers.shift() ?? 'accepted';
      },
      pump() {},
      close() {},
      size: 0,
    });
    const settle = () => new Promise((done) => setTimeout(done, 0));
    clock.frame(1500);
    await settle();
    // The 1500 dropped and 1700 walked: 3200 owed, sent as the cap allows, 2000 first.
    clock.frame(1700);
    await settle();
    expect(sent.map((a) => a.ms)).toEqual([1500, 2000]);
    // The 2000 was dropped too: owed again, and sent at the next frames, 2000 then the 1200 left.
    expect(clock.hook().owed).toBe(3200);
    clock.frame(0);
    await settle();
    clock.frame(0);
    await settle();
    expect(sent.map((a) => a.ms)).toEqual([1500, 2000, 2000, 1200]);
    expect(clock.hook().owed).toBe(0);
  });

  it('keeps one elapse waiting at a time, what is walked meanwhile riding on the next (M7.1)', async () => {
    const answers: ((sent: Sent) => void)[] = [];
    const sent: Action[] = [];
    const clock = createGameClock(() => true, {
      post: (action) => {
        sent.push(action);
        return new Promise<Sent>((answer) => answers.push(answer));
      },
      pump() {},
      close() {},
      size: 0,
    });
    const settle = () => new Promise((done) => setTimeout(done, 0));
    clock.frame(1000);
    clock.frame(1000);
    clock.frame(1000);
    expect(sent.map((a) => a.ms)).toEqual([1000]);
    answers[0]?.('accepted');
    await settle();
    clock.frame(0);
    expect(sent.map((a) => a.ms)).toEqual([1000, 2000]);
    // The walk pauses while that one waits: what is owed goes as soon as it is answered.
    clock.frame(300);
    clock.flush();
    expect(sent).toHaveLength(2);
    answers[1]?.('accepted');
    await settle();
    expect(sent.map((a) => a.ms)).toEqual([1000, 2000, 300]);
  });
});
