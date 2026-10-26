/**
 * The walk (M5.8, D70, docs/specs/movement.md#the-stage): a space of the pack's world drawn into a
 * Space widget's box and walked. Rapier steps the character at 60 Hz, at most five steps a frame;
 * each step the zones it entered send world/trigger; the camera follows; the shell's pause holds it.
 * M5.9 (D71, docs/specs/worldspaces.md): it starts where a load stood the player, or at the spawn
 * point they arrive at; Interact uses what they face; it says where they stand; what is taken goes.
 * M5.10 (D72, docs/specs/streaming.md): it builds what is near the player and draws the models of
 * what is far, the ring around them worked out again as they cross into another cell.
 * M6.2 (D74, docs/specs/navigation.md#the-stage): in a space with a navmesh, its NPCs walk where the
 * sim sends them and a tap walks the player (navStage.ts).
 * M6.3 (D75, docs/specs/ai.md): the time walked runs the game's clock (gameClock.ts), and the NPCs
 * near the player see and hear them (walkSenses.ts).
 * M6.4 (D76, docs/specs/combat.md): in a game with fights, Attack swings and NPCs sent to attack
 * strike back, every hit found on the fixed steps and decided by the sim (fight.ts).
 * It resolves once its first frame is drawn, so the host's loading screen covers the wait.
 * Loaded the first time a Space widget draws, with three and Rapier.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { PackWorld } from '@eb/core';
import type { SpaceAsk, SpaceDrawn, WalkQuality } from '@eb/ui';
import { tierFromHints } from '../perf/hints.ts';
import { readHints } from '../perf/readHints.ts';
import { lowerTier, TIERS } from '../perf/tiers.ts';
import { FIGURE } from '../spaces/figureLook.ts';
import type { Vec3 } from '../spaces/vec.ts';
import { type Acts, createActs, type InputBy } from './acts.ts';
import { heldPitch, type Shot, shotOf, THIRD, type ViewKind } from './cameras.ts';
import { type Held, intentOf, PAD_DEAD } from './controls.ts';
import { createFight, type FightNpc, type FightStage, WAITING_M } from './fight.ts';
import { createGameClock, type GameClock } from './gameClock.ts';
import { objectPlaces } from './goals.ts';
import { clearWalkHook, setWalkHook, type WalkHook } from './hook.ts';
import type { LoadNav } from './host.ts';
import { jumpOf, stepsFor } from './motion.ts';
import { createNavStage, type NavStage, npcsOf } from './navStage.ts';
import { createOutbox } from './outbox.ts';
import { createWalker, type Walker } from './physics.ts';
import { createPrompt } from './prompt.ts';
import { createSender, type Sender } from './sender.ts';
import { spawnOf } from './solids.ts';
import { createStreamer, type Ring } from './streamer.ts';
import { createStreaming, type Streaming } from './streaming.ts';
import { createSurface, type Surface, type Tier } from './surface.ts';
import { createTouches } from './touch.ts';
import { createWalkSenses, type WalkSenses } from './walkSenses.ts';
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
  readonly began: WalkHook['began'];
  readonly walker: Walker;
  readonly sender: Sender;
  readonly acts: Acts;
  readonly surface: Surface;
  readonly streaming: Streaming;
  readonly nav: NavStage | null;
  readonly clock: GameClock;
  readonly senses: WalkSenses | null;
  readonly fight: FightStage | null;
  gone(): ReadonlySet<string>;
  look(): { yaw: number; pitch: number; shot: Shot; paused: boolean };
}

const hookOf = ({
  space,
  kind,
  began,
  walker,
  sender,
  acts,
  surface,
  streaming,
  nav,
  clock,
  senses,
  fight,
  gone,
  look,
}: Walking): WalkHook => ({
  space,
  began,
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
  prompt: () => acts.prompt(),
  used: () => acts.used(),
  stood: () => acts.stood(),
  taken: () => [...gone()].sort(),
  hidden: () => surface.view.hidden(),
  moving: () => walker.moving().map(({ path, at }) => ({ path, at })),
  get frames() {
    return surface.view.frames;
  },
  get paused() {
    return look().paused;
  },
  perf: () => surface.view.perf(surface.clock.intervals()),
  cells: () => streaming.cells(),
  npcs: () => surface.view.npcs.list(),
  nav: () => nav?.hook() ?? null,
  screenOf: (point) => surface.view.screenOf(point),
  clock: () => clock.hook(),
  senses: () => senses?.hook() ?? null,
  fight: () => fight?.hook() ?? null,
});

/** What moved the walk last, for the key the prompt names: E, the pad's X, or none for touch. */
function inputBy(held: Held, was: InputBy): InputBy {
  const pad = held.pad;
  if (pad && (pad.a || pad.x === true || pad.rt === true || pad.axes.some((v) => Math.abs(v) > PAD_DEAD))) return 'pad';
  if (held.keys.size > 0 || held.drag?.by === 'mouse' || held.click) return 'keys';
  if (
    held.jumpButton ||
    held.attackButton ||
    held.drag?.by === 'touch' ||
    (held.stick && (held.stick.x !== 0 || held.stick.y !== 0))
  )
    return 'touch';
  return was;
}

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export async function startStage(
  box: HTMLElement,
  ask: SpaceAsk,
  world: PackWorld,
  loadNav?: LoadNav,
): Promise<SpaceDrawn> {
  const space = walkSpace(world, ask.space);
  if (!space) {
    box.textContent = `No space "${ask.space}" in this game.`;
    return { pause() {}, quality() {}, taken() {}, stop() {} };
  }
  await loadRapier();
  const spawn = spawnOf(space.parts.spawns, ask.arrive);
  const at: Vec3 | undefined = ask.at ? [ask.at.feet[0], ask.at.feet[1], ask.at.feet[2]] : undefined;
  const tier = await tierFor(ask.quality);
  // The ring around where the player starts is built before the walk does (M5.10): its solids first.
  const streamer = createStreamer(space.parts, space.streamed.footprints, TIERS[tier.name].viewDistance);
  const begin = at ?? spawn?.at ?? [0, 0, 0];
  const first = streamer.at(begin[0], begin[2], new Set(ask.taken)) as Ring;
  const walker = createWalker(RAPIER, { solids: first.solids, spawn, ...(at ? { at } : {}) }, space.ground);
  const kind: ViewKind = spawn?.view ?? 'third';
  const surface = await createSurface(box, space, tier);
  const touches = createTouches(box, ask.fight?.() !== undefined);
  const prompt = createPrompt(box);
  // Every step the walk asks for goes one at a time, zones' triggers too: the shell drops one sent
  // while another is on its way.
  const outbox = createOutbox(ask.send);
  const sender = createSender(ask.space, outbox, first.zones);
  const acts = createActs(
    ask,
    outbox,
    first.uses,
    prompt,
    { feet: walker.feet(), time: performance.now() },
    (path, feet) => surface.view.npcs.face(path, feet, performance.now()),
  );
  let gone = acts.taken(ask.taken);
  surface.view.hide(gone);
  const view = () => surface.view;
  // A fallen NPC's body stays out of the world when its cell is built again (M6.4).
  let fight: FightStage | null = null;
  const streamWalker: Walker = { ...walker, add: (solids) => walker.add(solids.filter((s) => !fight?.fell(s.path))) };
  const streaming = createStreaming(
    space,
    streamer,
    first,
    { walker: streamWalker, sender, acts, view },
    TIERS[tier.name].viewDistance,
    gone,
  );
  const nav = await createNavStage(space, world, ask, outbox, loadNav, {
    walker,
    view,
    begun: first.near,
    keep: (actor) => fight?.keep(actor) ?? { distance: WAITING_M, away: true },
  });
  const clock = createGameClock(() => ask.clocked?.() === true, outbox);
  const placed = objectPlaces(space.space, space.prefabs);
  const senses = createWalkSenses(
    space,
    world,
    outbox,
    ask.here,
    () => {
      const agents = new Map((nav?.hook().agents ?? []).map((a) => [a.path, a.at]));
      return surface.view.npcs.list().flatMap((n) => {
        const at = agents.get(n.path) ?? placed.get(n.path);
        return at ? [{ path: n.path, at, yaw: n.yaw }] : [];
      });
    },
    walker.clear,
  );
  const placedNpcs = npcsOf(space, world, placed);
  const heightOf = (actor: string) => space.npcs(`actor:${actor}`, [])?.height ?? FIGURE.height;
  fight = createFight(ask, outbox, {
    walker,
    npcs: (): FightNpc[] => {
      const built = surface.view.npcs.built();
      const agents = nav?.hook().agents;
      if (agents) return agents.map((a) => ({ ...a, height: heightOf(a.actor), here: a.state !== 'away' }));
      return placedNpcs.map((n) => ({ ...n, at: n.placed, here: built.has(n.path) }));
    },
    pose: (path, pose) => surface.view.npcs.pose(path, pose),
    bodies: (uses) => acts.bodies(uses),
  });
  const began: WalkHook['began'] = at
    ? { from: 'at' }
    : spawn && spawn.path === ask.arrive
      ? { from: 'arrive', spawn: spawn.path }
      : { from: 'start', ...(spawn ? { spawn: spawn.path } : {}) };
  let [yaw, pitch] = [ask.at?.yaw ?? spawn?.yaw ?? 0, kind === 'third' ? THIRD.pitch : 0];
  let shot: Shot = shotOf(kind, walker.feet(), yaw, pitch, walker.clear);
  let [stopped, paused, carried, jumpWaiting, last, frame] = [false, false, 0, false, performance.now(), 0];
  let by: InputBy = coarse() ? 'touch' : 'keys';
  const retier = (next: Tier) =>
    surface.retier(next).then(() => {
      surface.view.hide(gone);
      const [x, , z] = walker.feet();
      streaming.redraw(TIERS[next.name].viewDistance, x, z, gone);
    });

  const draw = () => {
    shot = shotOf(kind, walker.feet(), yaw, pitch, walker.clear);
    surface.view.frame(shot, walker.feet(), yaw, kind === 'third', walker.moving());
  };
  const tick = (time: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    const elapsed = Math.min(0.25, (time - last) / 1000);
    last = time;
    // Paused, nothing moves and the frame is held: but for an NPC turning to face the player (M6.1).
    if (paused) {
      if (surface.view.npcs.turning(time)) draw();
      return;
    }
    const held = { ...surface.inputs.take(), ...touches.take() };
    by = inputBy(held, by);
    const pushed = intentOf(held, elapsed);
    const intent = nav ? nav.intent(pushed, held.tap, walker.feet(), yaw) : pushed;
    yaw += intent.look[0];
    pitch = heldPitch(kind, pitch + intent.look[1]);
    const steps = stepsFor(carried, elapsed);
    carried = steps.carried;
    const { jump, waiting } = jumpOf(intent.jump, jumpWaiting, steps.steps);
    jumpWaiting = waiting;
    for (let i = 0; i < steps.steps; i++) {
      walker.step({ ...intent, jump }, yaw);
      const feet = walker.feet();
      if (fight) yaw = fight.step(intent.attack, feet, yaw);
      nav?.step(feet);
      streaming.step(feet[0], feet[2], gone);
      sender.step(feet);
    }
    acts.frame(walker.feet(), yaw, intent.use, by, time);
    nav?.frame(time);
    clock.frame(elapsed * 1000);
    senses?.frame(elapsed * 1000, walker.feet(), intent, walker.grounded());
    if (fight) {
      fight.frame();
      surface.view.lean(fight.lean());
      surface.view.arrows.draw(fight.arrows());
    }
    draw();
    // Auto steps down when frames run long (D69); every frame of a walk is drawn back to back.
    const lower = surface.clock.frame(time, true) && surface.tier.auto ? lowerTier(surface.tier.name) : null;
    if (lower) void retier({ name: lower, auto: true });
  };
  // The page hidden is the last chance to say where the player stood: a phone may close the tab.
  const hidden = () => {
    if (document.visibilityState !== 'hidden' || paused) return;
    acts.stand(walker.feet(), yaw, performance.now());
    nav?.stand(performance.now());
    clock.flush();
  };
  document.addEventListener('visibilitychange', hidden);
  draw();
  frame = requestAnimationFrame(tick);

  const hook = hookOf({
    space: ask.space,
    kind,
    began,
    walker,
    sender,
    acts,
    surface,
    streaming,
    nav,
    clock,
    senses,
    fight,
    gone: () => gone,
    look: () => ({ yaw, pitch, shot, paused }),
  });
  setWalkHook(hook);
  return {
    pause(on) {
      if (on && !paused) {
        acts.stand(walker.feet(), yaw, performance.now());
        nav?.stand(performance.now());
        clock.flush();
      }
      paused = on;
      // The walk goes on, its talk over: the NPC that faced the player turns back.
      if (!on) return surface.view.npcs.back(performance.now());
      surface.inputs.clear();
      touches.clear();
    },
    quality(next) {
      void tierFor(next).then((picked) => {
        const now = surface.tier;
        if (!stopped && (picked.name !== now.name || picked.auto !== now.auto)) void retier(picked);
      });
    },
    taken(paths) {
      gone = acts.taken(paths);
      walker.remove(gone);
      surface.view.hide(gone);
    },
    npcs(next) {
      nav?.told(next);
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', hidden);
      acts.close();
      clearWalkHook(hook);
      nav?.stop();
      surface.dispose();
      touches.dispose();
      prompt.dispose();
      walker.free();
    },
  };
}
