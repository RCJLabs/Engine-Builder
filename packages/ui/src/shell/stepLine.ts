/**
 * One step of the game at a time (M6.3, D75): the stage's steps and the player's share one line to
 * the game's worker. Since the clock runs while walking, the stage sends a step every second or so,
 * and a press that came while one was on its way was dropped. Now one that comes while another is on
 * its way is dropped if it is the stage's, whose outbox tries it again, and waits if it is the
 * player's, the latest kept: a press is never lost to an elapse or a sense's report, and the screens'
 * buttons are disabled only while a press of the player's own is on its way. They come back as the
 * press lands, in the one render with its view: a screen gives focus back to a button as the view
 * changes, and one still disabled then can't take it.
 */
import type { Action } from '@eb/core';
import type { Sent } from '../render/spaceHost.ts';

export interface StepLine {
  /** The stage's step, or 'dropped' while another is on its way. */
  stage(action: Action): Promise<Sent>;
  /** A player's step: sent now, or as soon as the one on its way is done. */
  player(action: Action): void;
  /** A player's step on its way or waiting. */
  acting(): boolean;
}

/**
 * `send` takes one step and says what the sim made of it, calling `landing` just before it shows the
 * step's view; `changed` hears `acting` change.
 */
export function createStepLine(
  send: (action: Action, landing: () => void) => Promise<Sent>,
  changed: (acting: boolean) => void,
): StepLine {
  let flying = false;
  let mine = false;
  let waiting: Action | undefined;
  const set = (now: boolean) => {
    if (now !== mine) changed(now);
    mine = now;
  };
  const go = async (action: Action, player: boolean): Promise<Sent> => {
    flying = true;
    if (player) set(true);
    try {
      return await send(action, () => {
        if (player && waiting === undefined) set(false);
      });
    } finally {
      flying = false;
      const next = waiting;
      waiting = undefined;
      if (next) void go(next, true);
      else if (player) set(false);
    }
  };
  return {
    stage: (action) => (flying ? Promise.resolve('dropped') : go(action, false)),
    player(action) {
      if (!flying) return void go(action, true);
      waiting = action;
      set(true);
    },
    acting: () => mine,
  };
}
