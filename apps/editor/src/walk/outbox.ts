/**
 * The walk's uses and where it stands, sent one at a time (M5.9, D71): the shell drops a step asked
 * for while another is on its way, so world/at then world/use, back to back, would lose the use.
 * The next goes when none is on its way; a dropped one is tried again RETRY_MS later, up to TRIES
 * times, by a timer, so a hidden page, which draws no frames, still sends it. A newer world/at takes
 * the place of one still waiting: only the latest counts; and a newer world/npcs-at (M6.2) of one
 * still waiting, since it carries every arrival not yet heard. A player's own press (M7.1) goes ahead
 * of the stage's letters still waiting, never the one on its way: on a slow phone, or CI's software
 * renderer, the clock's and the senses' letters queued up, and a use waited 15 s behind them.
 */
import type { Action } from '@eb/core';
import type { Sent } from '@eb/ui';

export const TRIES = 60;
export const RETRY_MS = 50;

/** The actions only the latest of counts. */
const LATEST: ReadonlySet<string> = new Set(['world/at', 'world/npcs-at']);

export interface Outbox {
  /**
   * Sent after those posted before it, or a player's ahead of the stage's waiting; what the sim made
   * of it, or dropped after TRIES frames.
   */
  post(action: Action, player?: boolean): Promise<Sent>;
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
  readonly player: boolean;
  tries: number;
}

export function createOutbox(send: (action: Action) => Promise<Sent>): Outbox {
  const queue: Letter[] = [];
  let flying = false;
  let closed = false;
  const box: Outbox = {
    post(action, player = false) {
      return new Promise<Sent>((done) => {
        if (LATEST.has(action.type)) {
          // Never the one on its way, nor a use's stand for the stage's: the use must not go first.
          const old = queue.findIndex(
            (l, i) => (i > 0 || !flying) && l.action.type === action.type && (player || !l.player),
          );
          if (old >= 0) queue.splice(old, 1)[0]?.done('dropped');
        }
        const letter = { action, done, player, tries: 0 };
        if (!player) return void queue.push(letter);
        // Behind the one on its way and the player's own before it, ahead of the stage's.
        let at = flying ? 1 : 0;
        while (queue[at]?.player) at++;
        queue.splice(at, 0, letter);
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
