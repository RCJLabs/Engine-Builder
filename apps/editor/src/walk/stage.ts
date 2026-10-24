/**
 * The walk (M5.8, D70, docs/specs/movement.md#the-stage): a space of the pack's world drawn into a
 * Space widget's box and walked. Rapier steps the character at 60 Hz, at most five steps a frame;
 * each step the zones it entered send world/trigger; the camera follows; the shell's pause holds it.
 * Loaded the first time a Space widget draws, with three and Rapier.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { PackWorld } from '@eb/core';
import type { Sent, SpaceAsk, SpaceDrawn, WalkQuality } from '@eb/ui';
import { tierFromHints } from '../perf/hints.ts';
import { readHints } from '../perf/readHints.ts';
import { createFrameClock } from '../perf/stepDown.ts';
import { lowerTier, TIERS, type TierName } from '../perf/tiers.ts';
import { heldPitch, type Shot, shotOf, THIRD, type ViewKind } from './cameras.ts';
import { intentOf } from './controls.ts';
import { clearWalkHook, setWalkHook, type WalkHook } from './hook.ts';
import { createInputs } from './inputs.ts';
import { stepsFor } from './motion.ts';
import { BODY, createWalker } from './physics.ts';
import { spawnOf } from './solids.ts';
import { createTouches } from './touch.ts';
import { createWalkView, type WalkView } from './view.ts';
import { walkSpace } from './world.ts';
import { answered, inZone, stepZones, type ZoneState } from './zones.ts';

let rapierReady: Promise<void> | null = null;
const loadRapier = () => (rapierReady ??= RAPIER.init());

async function tierFor(quality: WalkQuality): Promise<{ name: TierName; auto: boolean }> {
  if (quality !== 'auto') return { name: quality, auto: false };
  return { name: tierFromHints(await readHints()).tier, auto: true };
}

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
  let yaw = spawn?.yaw ?? 0;
  let pitch = kind === 'third' ? THIRD.pitch : 0;
  let tier = await tierFor(ask.quality);
  let gone = false;
  let paused = false;

  box.style.position = 'absolute';
  const makeCanvas = () => {
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      touchAction: 'none',
    });
    box.prepend(canvas);
    return canvas;
  };
  let canvas = makeCanvas();
  let view: WalkView = await createWalkView(box, canvas, TIERS[tier.name], space);
  let inputs = createInputs(box, canvas);
  const touches = createTouches(box);
  let clock = createFrameClock();

  /** A new tier is a new view on a new canvas (D69): the walk, the character and the zones are kept. */
  const retier = async (name: TierName, auto: boolean) => {
    tier = { name, auto };
    const old = { view, canvas, inputs };
    canvas = makeCanvas();
    view = await createWalkView(box, canvas, TIERS[name], space);
    inputs = createInputs(box, canvas);
    clock = createFrameClock();
    old.inputs.dispose();
    old.view.dispose();
    old.canvas.remove();
  };

  let states: ReadonlyMap<string, ZoneState> = new Map();
  const sent: { object: string; sent: Sent | 'waiting' }[] = [];
  let inside: string[] = [];
  const send = (object: string) => {
    const entry: (typeof sent)[number] = { object, sent: 'waiting' };
    sent.push(entry);
    void ask.send({ type: 'world/trigger', space: ask.space, object }).then((answer) => {
      entry.sent = answer;
      states = answered(states, object, answer);
    });
  };

  let shot: Shot = shotOf(kind, walker.feet(), yaw, pitch, walker.clear);
  let carried = 0;
  let last = performance.now();
  let frame = 0;
  const tick = (time: number) => {
    if (gone) return;
    frame = requestAnimationFrame(tick);
    const elapsed = Math.min(0.25, (time - last) / 1000);
    last = time;
    // Paused, nothing moves and the frame is held.
    if (paused) return;
    const intent = intentOf({ ...inputs.take(), ...touches.take() }, elapsed);
    yaw += intent.look[0];
    pitch = heldPitch(kind, pitch + intent.look[1]);
    const steps = stepsFor(carried, elapsed);
    carried = steps.carried;
    for (let i = 0; i < steps.steps; i++) {
      walker.step(intent, yaw);
      const body = { feet: walker.feet(), height: BODY.height, radius: BODY.radius };
      inside = space.parts.zones.filter((zone) => inZone(zone, body)).map((zone) => zone.path);
      const step = stepZones(states, new Set(inside));
      states = step.states;
      for (const object of step.send) send(object);
    }
    shot = shotOf(kind, walker.feet(), yaw, pitch, walker.clear);
    view.frame(shot, walker.feet(), yaw, kind === 'third', walker.moving());
    // Auto steps down when frames run long (D69); every frame of a walk is drawn back to back.
    if (clock.frame(time, true) && tier.auto) {
      const lower = lowerTier(tier.name);
      if (lower) void retier(lower, true);
    }
  };
  frame = requestAnimationFrame(tick);

  const hook: WalkHook = {
    space: ask.space,
    character: () => ({
      feet: walker.feet(),
      velocity: walker.velocity(),
      grounded: walker.grounded(),
      view: kind,
      yaw,
      pitch,
    }),
    camera: () => ({ at: shot.at, distance: shot.distance }),
    zones: () => inside,
    sent: () => sent.map((s) => ({ ...s })),
    moving: () => walker.moving().map(({ path, at }) => ({ path, at })),
    get frames() {
      return view.frames;
    },
    get paused() {
      return paused;
    },
    perf: () => view.perf(clock.intervals()),
  };
  setWalkHook(hook);

  return {
    pause(on) {
      paused = on;
      if (on) {
        inputs.clear();
        touches.clear();
      }
    },
    quality(next) {
      void tierFor(next).then((picked) => {
        if (!gone && (picked.name !== tier.name || picked.auto !== tier.auto)) void retier(picked.name, picked.auto);
      });
    },
    stop() {
      gone = true;
      cancelAnimationFrame(frame);
      clearWalkHook(hook);
      inputs.dispose();
      touches.dispose();
      view.dispose();
      canvas.remove();
      walker.free();
    },
  };
}
