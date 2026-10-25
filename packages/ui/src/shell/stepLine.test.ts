/**
 * The step line (M6.3): the stage's steps dropped while another is on its way, the player's waiting
 * for it, the latest kept, and the buttons disabled only while a press of the player's is on its way.
 */
import type { Action } from '@eb/core';
import { describe, expect, it } from 'vitest';
import type { Sent } from '../render/spaceHost.ts';
import { createStepLine } from './stepLine.ts';

/** A worker whose steps each wait until the test lets them go. */
function worker() {
  const sent: string[] = [];
  const open: (() => void)[] = [];
  const acting: boolean[] = [];
  // What the page sees, in order: the buttons coming and going, and each step's view.
  const seen: string[] = [];
  const line = createStepLine(
    (action, landing) =>
      new Promise<Sent>((done) => {
        sent.push(action.type);
        open.push(() => {
          landing();
          seen.push(`view of ${action.type}`);
          done('accepted');
        });
      }),
    (now) => {
      acting.push(now);
      seen.push(now ? 'buttons off' : 'buttons on');
    },
  );
  const finish = async () => {
    open.shift()?.();
    await new Promise((done) => setTimeout(done, 0));
  };
  return { line, sent, acting, seen, finish };
}

const step = (type: string): Action => ({ type });

describe('the step line', () => {
  it('drops a stage’s step while another is on its way, for its outbox to try again', async () => {
    const w = worker();
    const first = w.line.stage(step('time/elapse'));
    expect(await w.line.stage(step('ai/sensed'))).toBe('dropped');
    await w.finish();
    expect(await first).toBe('accepted');
    expect(w.sent).toEqual(['time/elapse']);
    expect(w.acting).toEqual([]);
  });

  it('keeps a press that comes while the stage’s step is on its way, and sends it once that is done', async () => {
    const w = worker();
    void w.line.stage(step('time/elapse'));
    w.line.player(step('village/wait'));
    expect(w.line.acting()).toBe(true);
    expect(w.sent).toEqual(['time/elapse']);
    await w.finish();
    expect(w.sent).toEqual(['time/elapse', 'village/wait']);
    // The stage's next is dropped while the press is on its way.
    expect(await w.line.stage(step('ai/sensed'))).toBe('dropped');
    await w.finish();
    expect(w.line.acting()).toBe(false);
    expect(w.acting).toEqual([true, false]);
  });

  it('keeps only the latest of presses that came while one was on its way', async () => {
    const w = worker();
    w.line.player(step('a'));
    w.line.player(step('b'));
    w.line.player(step('c'));
    await w.finish();
    await w.finish();
    expect(w.sent).toEqual(['a', 'c']);
    expect(w.acting).toEqual([true, false]);
  });

  it('sends a press at once when nothing is on its way, and its buttons back once it is done', async () => {
    const w = worker();
    w.line.player(step('dialogue/go-on'));
    expect(w.sent).toEqual(['dialogue/go-on']);
    expect(w.line.acting()).toBe(true);
    await w.finish();
    expect(w.line.acting()).toBe(false);
  });

  it('gives the buttons back as a press lands, before its view, so they are drawn enabled with it', async () => {
    const w = worker();
    void w.line.stage(step('time/elapse'));
    w.line.player(step('store/leave'));
    await w.finish();
    await w.finish();
    // The elapse's view comes with the press still waiting; the press's with its buttons back.
    expect(w.seen).toEqual(['buttons off', 'view of time/elapse', 'buttons on', 'view of store/leave']);
  });
});
