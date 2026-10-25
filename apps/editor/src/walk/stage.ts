/**
 * The walk (M5.8, D70, docs/specs/movement.md#the-stage): a space of the pack's world drawn into a
 * Space widget's box and walked. Rapier steps the character at 60 Hz, at most five steps a frame;
 * each step the zones it entered send world/trigger; the camera follows; the shell's pause holds it.
 * Loaded the first time a Space widget draws, with three and Rapier.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { PackWorld } from '@eb/core';
import type { SpaceAsk, SpaceDrawn, WalkQuality } from '@eb/ui';
import { tierFromHints } from '../perf/hints.ts';
import { readHints } from '../perf/readHints.ts';
import { lowerTier } from '../perf/tiers.ts';
import { heldPitch, type Shot, shotOf, THIRD, type ViewKind } from './cameras.ts';
import { intentOf } from './controls.ts';
import { clearWalkHook, setWalkHook, type WalkHook } from './hook.ts';
import { jumpOf, stepsFor } from './motion.ts';
import { createWalker, type Walker } from './physics.ts';
import { createSender, type Sender } from './sender.ts';
import { spawnOf } from './solids.ts';
import { createSurface, type Surface, type Tier } from './surface.ts';
import { createTouches } from './touch.ts';
import { walkSpace } from './world.ts';

let rapierReady: Promise<void> | null = null;
const loadRapier = () => (rapierReady ??= RAPIER.init());

async function tierFor(quality: WalkQuality): Promise<Tier> {
  if (quality !== 'auto') return { name: quality, auto: false };
  return { name: tierFromHints(await readHints()).tier, auto: true };
}

/** What the hook reads of a walk, as the stage holds it. */
interface Walking {
  readonly space: string;
  readonly kind: ViewKind;
  readonly walker: Walker;
  readonly sender: Sender;
  readonly surface: Surface;
  look(): { yaw: number; pitch: number; shot: Shot; paused: boolean };
}

const hookOf = ({ space, kind, walker, sender, surface, look }: Walking): WalkHook => ({
  space,
  character: () => ({
    feet: walker.feet(),
    velocity: walker.velocity(),
    grounded: walker.grounded(),
    view: kind,
    yaw: look().yaw,
    pitch: look().pitch,
  }),
  camera: () => ({ at: look().shot.at, distance: look().shot.distance }),
  zones: () => [...sender.inside],
  sent: () => sender.sent(),
  moving: () => walker.moving().map(({ path, at }) => ({ path, at })),
  get frames() {
    return surface.view.frames;
  },
  get paused() {
    return look().paused;
  },
  perf: () => surface.view.perf(surface.clock.intervals()),
});

export async function startStage(box: HTMLElement, ask: SpaceAsk, world: PackWorld): Promise<SpaceDrawn> {
  const space = walkSpace(world, ask.space);
  if (!space) {
    box.textContent = `No space "${ask.space}" in this game.`;
    return { pause() {}, quality() {}, stop() {} };
  }
  await loadRapier();
  const spawn = spawnOf(space.parts.spawns);
  const walker = createWalker(RAPIER, { solids: space.parts.solids, spawn }, space.ground);
  const kind: ViewKind = spawn?.view ?? 'third';
  const surface = await createSurface(box, space, await tierFor(ask.quality));
  const touches = createTouches(box);
  const sender = createSender(ask, space.parts.zones);
  let [yaw, pitch] = [spawn?.yaw ?? 0, kind === 'third' ? THIRD.pitch : 0];
  let shot: Shot = shotOf(kind, walker.feet(), yaw, pitch, walker.clear);
  let [gone, paused, carried, jumpWaiting, last, frame] = [false, false, 0, false, performance.now(), 0];

  const tick = (time: number) => {
    if (gone) return;
    frame = requestAnimationFrame(tick);
    const elapsed = Math.min(0.25, (time - last) / 1000);
    last = time;
    // Paused, nothing moves and the frame is held.
    if (paused) return;
    const intent = intentOf({ ...surface.inputs.take(), ...touches.take() }, elapsed);
    yaw += intent.look[0];
    pitch = heldPitch(kind, pitch + intent.look[1]);
    const steps = stepsFor(carried, elapsed);
    carried = steps.carried;
    const { jump, waiting } = jumpOf(intent.jump, jumpWaiting, steps.steps);
    jumpWaiting = waiting;
    for (let i = 0; i < steps.steps; i++) {
      walker.step({ ...intent, jump }, yaw);
      sender.step(walker.feet());
    }
    shot = shotOf(kind, walker.feet(), yaw, pitch, walker.clear);
    surface.view.frame(shot, walker.feet(), yaw, kind === 'third', walker.moving());
    // Auto steps down when frames run long (D69); every frame of a walk is drawn back to back.
    const lower = surface.clock.frame(time, true) && surface.tier.auto ? lowerTier(surface.tier.name) : null;
    if (lower) void surface.retier({ name: lower, auto: true });
  };
  frame = requestAnimationFrame(tick);

  const hook = hookOf({ space: ask.space, kind, walker, sender, surface, look: () => ({ yaw, pitch, shot, paused }) });
  setWalkHook(hook);
  return {
    pause(on) {
      paused = on;
      if (!on) return;
      surface.inputs.clear();
      touches.clear();
    },
    quality(next) {
      void tierFor(next).then((picked) => {
        const now = surface.tier;
        if (!gone && (picked.name !== now.name || picked.auto !== now.auto)) void surface.retier(picked);
      });
    },
    stop() {
      gone = true;
      cancelAnimationFrame(frame);
      clearWalkHook(hook);
      surface.dispose();
      touches.dispose();
      walker.free();
    },
  };
}
