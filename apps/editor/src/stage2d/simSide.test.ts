import type { PackWorld } from '@eb/core';
import type { Sent, SpaceAsk } from '@eb/ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSimSide } from './simSide.ts';

/** The sim's side of a page: nothing hidden, nothing to listen to. */
const page = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };

describe('a 2D space’s sim side', () => {
  beforeEach(() => {
    (globalThis as { document?: unknown }).document = page;
  });
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it('sends the player’s use ahead of the stage’s letters waiting, behind only the one on its way', async () => {
    const sent: string[] = [];
    const answers: ((sent: Sent) => void)[] = [];
    const ask = {
      space: 'tower',
      here: () => true,
      clocked: () => true,
      npcs: {},
      send: (action: { type: string }) => {
        sent.push(action.type);
        return new Promise<Sent>((answer) => answers.push(answer));
      },
    } as unknown as SpaceAsk;
    const world = { records: {}, uses: {} } as unknown as PackWorld;
    const sim = createSimSide(ask, world, [{ actor: 'wynn', at: [40, 48] }], new Map(), {});
    // A second walked: the clock's elapse goes, and is on its way.
    sim.step(1, 0);
    expect(sent).toEqual(['time/elapse']);
    // The shell's pause says where the folk stand: that letter waits behind the elapse.
    sim.pause(true);
    sim.pause(false);
    sim.use('bell');
    answers[0]?.('accepted');
    await new Promise((done) => setTimeout(done, 0));
    // CI's tower run waited past 5 s for the bell behind the clock's and the folk's letters (M7.4).
    expect(sent).toEqual(['time/elapse', 'world/use']);
    sim.stop();
  });
});
