/**
 * The game's clock as the walk runs it (M6.3, D75, docs/specs/ai.md#the-clock): the real time walked,
 * told to the sim as time/elapse once a second through the outbox, whole milliseconds. Frames add
 * their time while the walk runs and the game's mode allows it; the pause and a hidden page send what
 * is owed at once. What a dropped elapse carried is owed to the next; one the sim refused is gone.
 * One elapse waits at a time (M7.1): what is walked meanwhile rides on the next, so a slow phone's
 * outbox never queues a second of them behind another.
 */
import { ELAPSE_CAP_MS } from '@eb/core';
import type { Sent } from '@eb/ui';
import type { Outbox } from './outbox.ts';

/** How often the walk tells the sim the time it walked. */
export const ELAPSE_EVERY_MS = 1000;
/** The hook keeps this many of the newest elapses sent. */
export const KEPT = 64;

export interface GameClock {
  /** A frame's real milliseconds, the frame's own cap already taken off. */
  frame(ms: number): void;
  /** What is owed, sent now: the shell's pause, the page hidden. */
  flush(): void;
  /** The hook's: what is owed, and each elapse sent with what the sim made of it. */
  hook(): { readonly owed: number; readonly sent: readonly { readonly ms: number; readonly sent: Sent | 'waiting' }[] };
}

export function createGameClock(running: () => boolean, outbox: Outbox): GameClock {
  let owed = 0;
  let waiting = false;
  // A flush asked while an elapse waits: what is owed goes as soon as it is answered.
  let flushing = false;
  const log: { ms: number; sent: Sent | 'waiting' }[] = [];
  const send = () => {
    if (waiting) return;
    // No more than the sim takes in one: the rest stays owed.
    const ms = Math.min(Math.floor(owed), ELAPSE_CAP_MS);
    if (ms < 1) return;
    owed -= ms;
    waiting = true;
    const entry: { ms: number; sent: Sent | 'waiting' } = { ms, sent: 'waiting' };
    log.push(entry);
    if (log.length > KEPT) log.shift();
    void outbox.post({ type: 'time/elapse', ms }).then((sent) => {
      entry.sent = sent;
      waiting = false;
      if (sent === 'dropped') owed += ms;
      if (flushing && running()) {
        flushing = false;
        send();
      }
    });
    outbox.pump();
  };
  return {
    frame(ms) {
      if (!running()) return;
      owed += ms;
      if (owed >= ELAPSE_EVERY_MS) send();
    },
    flush() {
      if (!running()) return;
      flushing = waiting;
      send();
    },
    hook: () => ({ owed: Math.floor(owed), sent: log.map((e) => ({ ...e })) }),
  };
}
