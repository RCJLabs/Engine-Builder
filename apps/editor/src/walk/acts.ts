/**
 * What the walk tells the sim besides its zones (M5.9, D71, docs/specs/worldspaces.md): Interact on
 * what the player faces, sent as world/use after a world/at, and where the player stands, as the
 * shell pauses, the page hides and every 5 s once they have moved. Both go through the outbox, one at
 * a time, with the zones' triggers. What the sim says is taken is hidden and loses its solids.
 * Bodies (M6.4) are uses too, given apart, whose Search sends fighting/search.
 */
import type { Sent, SpaceAsk } from '@eb/ui';
import type { Vec3 } from '../spaces/vec.ts';
import { facing } from './interact.ts';
import type { Outbox } from './outbox.ts';
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
  /** The uses offered from now on (M5.10): those of the objects built. */
  uses(next: readonly UsePoint[]): void;
  /** The bodies to search now (M6.4), offered beside the uses. */
  bodies(next: readonly UsePoint[]): void;
  /** How many uses are offered. */
  readonly offered: number;
  /** The walk is stopped: nothing waiting is sent. */
  close(): void;
  used(): { readonly object: string; readonly sent: Sent | 'waiting' }[];
  stood(): { readonly feet: readonly number[]; readonly yaw: number; readonly sent: Sent | 'waiting' }[];
}

const KEYS: Readonly<Record<InputBy, string | null>> = { keys: 'E', pad: 'X', touch: null };

export function createActs(
  ask: SpaceAsk,
  outbox: Outbox,
  first: readonly UsePoint[],
  prompt: Prompt,
  start: Told,
  /** Each use as it is sent (M6.1): an NPC's Talk turns it toward the player. */
  onUse: (path: string, feet: Vec3) => void = () => {},
): Acts {
  let uses = first;
  let bodies: readonly UsePoint[] = [];
  let gone: ReadonlySet<string> = new Set(ask.taken);
  let faced: UsePoint | undefined;
  let held = false;
  let told = start;
  const used: { object: string; sent: Sent | 'waiting' }[] = [];
  const stood: { feet: readonly number[]; yaw: number; sent: Sent | 'waiting' }[] = [];

  let said = '';
  /** `player`: said just before a use, so it goes with the use ahead of the stage's letters. */
  const stand = (feet: Vec3, yaw: number, now: number, player = false) => {
    // A stage drawing a space the sim hasn't the player in says nothing of where they stand.
    if (!ask.here()) return;
    const action = standing(ask.space, feet, yaw);
    said = JSON.stringify([action.feet, action.yaw]);
    const entry: { feet: readonly number[]; yaw: number; sent: Sent | 'waiting' } = {
      feet: action.feet as number[],
      yaw: action.yaw as number,
      sent: 'waiting',
    };
    stood.push(entry);
    told = { feet, time: now };
    void outbox.post(action, player).then((sent) => {
      entry.sent = sent;
    });
  };
  const use = (target: UsePoint, feet: Vec3, yaw: number, now: number) => {
    stand(feet, yaw, now, true);
    const entry: { object: string; sent: Sent | 'waiting' } = { object: target.path, sent: 'waiting' };
    used.push(entry);
    const action = target.send ?? { type: 'world/use', space: ask.space, object: target.path };
    void outbox.post(action, true).then((sent) => {
      entry.sent = sent;
    });
    onUse(target.path, feet);
  };

  return {
    frame(feet, yaw, pressing, by, now) {
      faced = facing(bodies.length > 0 ? [...uses, ...bodies] : uses, feet, yaw, gone);
      prompt.show(faced?.label, KEYS[by]);
      // A press, not a hold: one use each time Interact goes down, or the prompt is tapped.
      const pressed = (pressing && !held) || prompt.take();
      held = pressing;
      if (pressed && faced) use(faced, feet, yaw, now);
      else if (dueAt(told, feet, now)) stand(feet, yaw, now);
      outbox.pump();
    },
    stand(feet, yaw, now) {
      // Already said, as a use says it just before (M6.1): a talk's mode would refuse it again.
      const action = standing(ask.space, feet, yaw);
      if (JSON.stringify([action.feet, action.yaw]) !== said) stand(feet, yaw, now);
      outbox.pump();
    },
    taken(paths) {
      gone = new Set(paths);
      return gone;
    },
    prompt: () => (faced ? { object: faced.path, label: faced.label } : null),
    uses(next) {
      uses = next;
    },
    bodies(next) {
      bodies = next;
    },
    get offered() {
      return uses.length;
    },
    close: () => outbox.close(),
    used: () => used.map((u) => ({ ...u })),
    stood: () => stood.map((s) => ({ ...s })),
  };
}
