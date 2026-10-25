/**
 * What the walk tells the sim besides its zones (M5.9, D71, docs/specs/worldspaces.md): Interact on
 * what the player faces, sent as world/use after a world/at, and where the player stands, as the
 * shell pauses, the page hides and every 5 s once they have moved. Both go through the outbox, one at
 * a time. What the sim says is taken is hidden and loses its solids.
 */
import type { Sent, SpaceAsk } from '@eb/ui';
import type { Vec3 } from '../spaces/vec.ts';
import { facing } from './interact.ts';
import { createOutbox } from './outbox.ts';
import type { Prompt } from './prompt.ts';
import type { UsePoint } from './solids.ts';
import { dueAt, standing, type Told } from './stood.ts';

export type InputBy = 'keys' | 'pad' | 'touch';

export interface Acts {
  /** Each frame after the steps: the prompt, a use if Interact was pressed, a world/at when due. */
  frame(feet: Vec3, yaw: number, use: boolean, by: InputBy, now: number): void;
  /** Where the player stands, said now: the shell's pause, the page hidden. */
  stand(feet: Vec3, yaw: number, now: number): void;
  /** The objects taken here, as the sim says. */
  taken(paths: readonly string[]): ReadonlySet<string>;
  prompt(): { readonly object: string; readonly label: string } | null;
  /** The walk is stopped: nothing waiting is sent. */
  close(): void;
  used(): { readonly object: string; readonly sent: Sent | 'waiting' }[];
  stood(): { readonly feet: readonly number[]; readonly yaw: number; readonly sent: Sent | 'waiting' }[];
}

const KEYS: Readonly<Record<InputBy, string | null>> = { keys: 'E', pad: 'X', touch: null };

export function createActs(ask: SpaceAsk, uses: readonly UsePoint[], prompt: Prompt, start: Told): Acts {
  const outbox = createOutbox(ask.send);
  let gone: ReadonlySet<string> = new Set(ask.taken);
  let faced: UsePoint | undefined;
  let held = false;
  let told = start;
  const used: { object: string; sent: Sent | 'waiting' }[] = [];
  const stood: { feet: readonly number[]; yaw: number; sent: Sent | 'waiting' }[] = [];

  const stand = (feet: Vec3, yaw: number, now: number) => {
    // A stage drawing a space the sim hasn't the player in says nothing of where they stand.
    if (!ask.here()) return;
    const action = standing(ask.space, feet, yaw);
    const entry: { feet: readonly number[]; yaw: number; sent: Sent | 'waiting' } = {
      feet: action.feet as number[],
      yaw: action.yaw as number,
      sent: 'waiting',
    };
    stood.push(entry);
    told = { feet, time: now };
    void outbox.post(action).then((sent) => {
      entry.sent = sent;
    });
  };
  const use = (target: UsePoint, feet: Vec3, yaw: number, now: number) => {
    stand(feet, yaw, now);
    const entry: { object: string; sent: Sent | 'waiting' } = { object: target.path, sent: 'waiting' };
    used.push(entry);
    void outbox.post({ type: 'world/use', space: ask.space, object: target.path }).then((sent) => {
      entry.sent = sent;
    });
  };

  return {
    frame(feet, yaw, pressing, by, now) {
      faced = facing(uses, feet, yaw, gone);
      prompt.show(faced?.label, KEYS[by]);
      // A press, not a hold: one use each time Interact goes down, or the prompt is tapped.
      const pressed = (pressing && !held) || prompt.take();
      held = pressing;
      if (pressed && faced) use(faced, feet, yaw, now);
      else if (dueAt(told, feet, now)) stand(feet, yaw, now);
      outbox.pump();
    },
    stand(feet, yaw, now) {
      stand(feet, yaw, now);
      outbox.pump();
    },
    taken(paths) {
      gone = new Set(paths);
      return gone;
    },
    prompt: () => (faced ? { object: faced.path, label: faced.label } : null),
    close: () => outbox.close(),
    used: () => used.map((u) => ({ ...u })),
    stood: () => stood.map((s) => ({ ...s })),
  };
}
