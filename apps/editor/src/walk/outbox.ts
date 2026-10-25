/**
 * The walk's uses and where it stands, sent one at a time (M5.9, D71): the shell drops a step asked
 * for while another is on its way, so world/at then world/use, back to back, would lose the use.
 * The next goes when none is on its way; a dropped one is tried again RETRY_MS later, up to TRIES
 * times, by a timer, so a hidden page, which draws no frames, still sends it. A newer world/at takes
 * the place of one still waiting: only the latest counts.
 */
import type { Action } from '@eb/core';
import type { Sent } from '@eb/ui';

export const TRIES = 60;
export const RETRY_MS = 50;

export interface Outbox {
  /** Sent after those posted before it; what the sim made of it, or dropped after TRIES frames. */
  post(action: Action): Promise<Sent>;
  /** The next goes, when none is on its way. */
  pump(): void;
  /** Nothing more is sent: what waits is dropped. */
  close(): void;
  /** Waiting or on its way. */
  readonly size: number;
}

interface Letter {
  readonly action: Action;
  readonly done: (sent: Sent) => void;
  tries: number;
}

export function createOutbox(send: (action: Action) => Promise<Sent>): Outbox {
  const queue: Letter[] = [];
  let flying = false;
  let closed = false;
  const box: Outbox = {
    post(action) {
      return new Promise<Sent>((done) => {
        if (action.type === 'world/at') {
          const old = queue.findIndex((l, i) => (i > 0 || !flying) && l.action.type === 'world/at');
          if (old >= 0) queue.splice(old, 1)[0]?.done('dropped');
        }
        queue.push({ action, done, tries: 0 });
      });
    },
    pump() {
      const next = queue[0];
      if (flying || closed || !next) return;
      flying = true;
      next.tries++;
      void send(next.action)
        .catch((): Sent => 'dropped')
        .then((sent) => {
          flying = false;
          if (sent === 'dropped' && next.tries < TRIES && !closed) {
            setTimeout(() => box.pump(), RETRY_MS);
            return;
          }
          queue.shift();
          next.done(sent);
          box.pump();
        });
    },
    close() {
      closed = true;
      for (const letter of queue.splice(0)) letter.done('dropped');
    },
    get size() {
      return queue.length;
    },
  };
  return box;
}
