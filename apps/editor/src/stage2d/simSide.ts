/**
 * What a 2D space does whoever draws it (M7.1, D83; apart since M7.4, D86): its walkers walked to the
 * marks the sim sends them to and their arrivals told back, the game's clock run as it is shown, a
 * use sent as world/use, and the pause that holds all three. stage.ts's built-in drawer and a stage
 * drawn in code (stagecode/codeStage.ts) both run on it.
 */
import type { PackWorld } from '@eb/core';
import type { NpcGoal, SpaceAsk } from '@eb/ui';
import { createGameClock } from '../walk/gameClock.ts';
import { createNpcTell } from '../walk/npcTell.ts';
import { createOutbox } from '../walk/outbox.ts';
import type { Point } from './camera.ts';
import { type Ground, sendTo, stepWalker, type Walker, walkersOf } from './walkers.ts';

export interface SimSide {
  readonly walkers: ReadonlyMap<string, Walker>;
  /** One frame's walking and clock, unless paused. */
  step(dt: number, now: number): void;
  /** world/use for an object, unless paused or stopped. */
  use(path: string): void;
  used(): { path: string; sent: string }[];
  /** The uses of the objects drawn, by path, with their labels. */
  usesOf(paths: ReadonlySet<string>): { path: string; label: string }[];
  paused(): boolean;
  pause(on: boolean): void;
  npcs(next: Readonly<Record<string, NpcGoal>>): void;
  tellSent: ReturnType<typeof createNpcTell>['sent'];
  clockHook: ReturnType<typeof createGameClock>['hook'];
  stop(): void;
}

export function createSimSide(
  ask: SpaceAsk,
  world: PackWorld,
  items: readonly { readonly actor?: string; readonly at: Point }[],
  places: ReadonlyMap<string, Point>,
  ground: Ground,
): SimSide {
  const record = (key: string) => (Object.hasOwn(world.records, key) ? world.records[key] : undefined);
  const outbox = createOutbox((action) => ask.send(action));
  const speedOf = (actor: string) => (record(`actor:${actor}`) as { speed?: unknown } | undefined)?.speed;
  const walkers = walkersOf(items, speedOf, ask.npcs, places, ground);
  const arrivals = new Map<string, string>();
  const tell = createNpcTell(ask, outbox, (actor, goal) => {
    if (arrivals.get(actor) === goal) arrivals.delete(actor);
  });
  let paused = false;
  let stopped = false;
  const clock = createGameClock(() => ask.clocked?.() === true && !paused, outbox);
  const used: { path: string; sent: string }[] = [];

  // The sim keeps a 2D figure's place as feet [x, y, 0] and its facing as a yaw: 90 right, 270 left.
  const list = () =>
    [...walkers.values()].map((w) => ({
      actor: w.actor,
      at: [w.at[0], w.at[1], 0] as [number, number, number],
      yaw: w.flip ? 270 : 90,
    }));
  const hidden = () => {
    if (document.visibilityState !== 'hidden') return;
    clock.flush();
    tell.stand(list(), arrivals, performance.now());
  };
  document.addEventListener('visibilitychange', hidden);

  return {
    walkers,
    step(dt, now) {
      if (paused) return;
      for (const walker of walkers.values()) {
        const arrived = stepWalker(walker, dt);
        if (arrived !== undefined) arrivals.set(walker.actor, arrived);
      }
      tell.frame(list(), arrivals, now);
      clock.frame(dt * 1000);
    },
    use(path) {
      if (paused || stopped) return;
      const entry = { path, sent: 'waiting' };
      used.push(entry);
      void outbox.post({ type: 'world/use', space: ask.space, object: path }).then((sent) => {
        entry.sent = sent;
      });
      outbox.pump();
    },
    used: () => used.map((u) => ({ ...u })),
    usesOf: (paths) =>
      Object.entries(world.uses?.[ask.space] ?? {})
        .filter(([path]) => paths.has(path))
        .map(([path, u]) => ({ path, label: u.label })),
    paused: () => paused,
    pause(on) {
      paused = on;
      if (on) {
        clock.flush();
        tell.stand(list(), arrivals, performance.now());
      }
    },
    npcs(next) {
      for (const [actor, told] of Object.entries(next)) {
        const walker = walkers.get(actor);
        if (walker) sendTo(walker, told, places, ground);
      }
    },
    tellSent: () => tell.sent(),
    clockHook: () => clock.hook(),
    stop() {
      stopped = true;
      document.removeEventListener('visibilitychange', hidden);
      outbox.close();
    },
  };
}
