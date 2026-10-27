/**
 * The 2D stage (M7.1, D83, docs/specs/2d-scenes.md#play): a 2D space drawn in its Space widget's
 * box, its clips playing on the page's clock, its figures walked to the marks the sim sends them to
 * and their arrivals told back, its uses as buttons over their sprites, and the game's clock run as
 * it is shown, as the 3D walk does. stage2d.js carries it; the hosts load it for a 2D space. Since
 * M7.2 a space's tilemap is drawn and its walkers route round its walls; since M7.3 a building is drawn
 * and its walkers climb its stairs.
 */
import type { SpaceJson } from '@eb/compiler';
import type { PackWorld } from '@eb/core';
import type { NpcGoal, SpaceAsk, SpaceDrawn } from '@eb/ui';
import { createGameClock } from '../walk/gameClock.ts';
import { createNpcTell } from '../walk/npcTell.ts';
import { createOutbox } from '../walk/outbox.ts';
import { buildingPieces } from './building2d.ts';
import { type Drawn, drawFrame } from './draw.ts';
import { publishHook } from './hook.ts';
import { worldBox } from './place.ts';
import { placesOf, sceneOf } from './scene.ts';
import { loadSheets } from './sheets.ts';
import { spaceStart } from './start.ts';
import { cellFrames } from './tilemap2d.ts';
import { createUseButtons } from './useButtons.ts';
import { createView } from './view.ts';
import { sendTo, stepWalker, walkersOf } from './walkers.ts';

/** The most a frame moves anything, in seconds: a hidden tab's long gap isn't a leap. */
const FRAME_CAP_S = 0.1;

export async function startStage2d(box: HTMLElement, ask: SpaceAsk, world: PackWorld): Promise<SpaceDrawn> {
  const space = world.spaces[ask.space] as SpaceJson;
  const sheets = await loadSheets(world);
  const record = (key: string) => (Object.hasOwn(world.records, key) ? world.records[key] : undefined);
  let taken = new Set(ask.taken);
  let items = sceneOf(space, world.prefabs, record, taken);
  const places = placesOf(space, world.prefabs);
  const tiles = world.tiles?.[ask.space];
  const building = world.buildings?.[ask.space];
  const ground = { ...(tiles ? { tiles } : {}), ...(building ? { building } : {}) };
  const { fit, size, start, backdrop } = spaceStart(space, items, sheets, ask);

  const outbox = createOutbox((action) => ask.send(action));
  const speedOf = (actor: string) => (record(`actor:${actor}`) as { speed?: unknown } | undefined)?.speed;
  const walkers = walkersOf(items, speedOf, ask.npcs, places, ground);
  const arrivals = new Map<string, string>();
  const tell = createNpcTell(ask, outbox, (actor, goal) => {
    if (arrivals.get(actor) === goal) arrivals.delete(actor);
  });
  const clock = createGameClock(() => ask.clocked?.() === true && !paused, outbox);
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  let paused = false;
  let stopped = false;
  let frames = 0;
  let last = performance.now();
  const born = last;
  let drawn: Drawn[] = [];
  const used: { path: string; sent: string }[] = [];
  const use = (path: string) => {
    if (paused || stopped) return;
    const entry = { path, sent: 'waiting' };
    used.push(entry);
    void outbox.post({ type: 'world/use', space: ask.space, object: path }).then((sent) => {
      entry.sent = sent;
    });
    outbox.pump();
  };
  const view = createView(box, fit, size, start, () => {});
  const buttons = createUseButtons(box, use, (centre) => view.look(centre));
  const usesHere = () =>
    Object.entries(world.uses?.[ask.space] ?? {})
      .filter(([path]) => items.some((i) => i.path === path))
      .map(([path, u]) => ({ path, label: u.label }));
  buttons.set(usesHere());

  // The sim keeps a 2D figure's place as feet [x, y, 0] and its facing as a yaw: 90 right, 270 left.
  const list = () =>
    [...walkers.values()].map((w) => ({
      actor: w.actor,
      at: [w.at[0], w.at[1], 0] as [number, number, number],
      yaw: w.flip ? 270 : 90,
    }));
  const frame = (now: number) => {
    const dt = Math.min(FRAME_CAP_S, (now - last) / 1000);
    last = now;
    if (!paused) {
      for (const walker of walkers.values()) {
        const arrived = stepWalker(walker, dt);
        if (arrived !== undefined) arrivals.set(walker.actor, arrived);
      }
      tell.frame(list(), arrivals, now);
      clock.frame(dt * 1000);
    }
    const { scale, cols, rows, dpr } = view.scaled();
    drawn = drawFrame(view.ctx, {
      items,
      sheets,
      walking: walkers,
      camera: view.camera(),
      view: [cols, rows],
      t: (now - born) / 1000,
      still,
      backdrop,
    });
    const corner = [view.camera()[0] - Math.floor(cols / 2), view.camera()[1] - Math.floor(rows / 2)] as const;
    buttons.place(new Map(drawn.map((d) => [d.path, d])), scale, dpr, corner, rows);
    frames++;
  };
  const hidden = () => {
    if (document.visibilityState !== 'hidden') return;
    clock.flush();
    tell.stand(list(), arrivals, performance.now());
  };
  document.addEventListener('visibilitychange', hidden);

  let raf = 0;
  const loop = (now: number) => {
    if (stopped) return;
    frame(now);
    raf = requestAnimationFrame(loop);
  };
  frame(performance.now());
  raf = requestAnimationFrame(loop);
  const unhook = publishHook({
    space: ask.space,
    scaled: () => view.scaled(),
    camera: () => view.camera(),
    drawn: () => drawn,
    frames: () => frames,
    uses: () => buttons.shown(),
    used: () => used.map((u) => ({ ...u })),
    walkers: () =>
      [...walkers.values()].map((w) => ({
        actor: w.actor,
        at: w.at,
        goal: w.goal,
        moving: w.moving,
        flip: w.flip,
        ...(w.route ? { route: w.route.map(([c, r]) => [c, r] as const) } : {}),
        ...(w.floors ? { floors: w.floors.map(([f, x]) => [f, x] as const) } : {}),
      })),
    building: () => {
      const item = building ? items.find((i) => i.path === building.object) : undefined;
      if (!building || !item || item.look.kind !== 'building') return undefined;
      const pieces = buildingPieces(item.look, item.at, (id) => sheets.record(id));
      return { path: item.path, at: building.at, slot: building.slot, pieces };
    },
    tilemap: () => {
      const item = tiles ? items.find((i) => i.path === tiles.object) : undefined;
      const tileset = item?.look.kind === 'tilemap' ? sheets.tileset?.(item.look.map.tileset) : undefined;
      if (!tiles || !item || item.look.kind !== 'tilemap' || !tileset) return undefined;
      return {
        path: item.path,
        size: tiles.size,
        tile: tiles.tile,
        at: tiles.at,
        frames: cellFrames(item.look.map, tileset.record),
      };
    },
    npcsSent: () => tell.sent(),
    clock: () => clock.hook(),
    look: (at) => view.look(at),
    boxOf: (path) => {
      const item = items.find((i) => i.path === path);
      const sprite = item?.look.kind === 'sprite' ? sheets.record(item.look.sprite) : undefined;
      return item ? worldBox(item, item.at, sprite) : undefined;
    },
  });

  return {
    pause(on) {
      paused = on;
      if (on) {
        clock.flush();
        tell.stand(list(), arrivals, performance.now());
      }
    },
    quality() {},
    taken(paths) {
      taken = new Set(paths);
      items = sceneOf(space, world.prefabs, record, taken);
      buttons.set(usesHere());
    },
    npcs(next: Readonly<Record<string, NpcGoal>>) {
      for (const [actor, told] of Object.entries(next)) {
        const walker = walkers.get(actor);
        if (walker) sendTo(walker, told, places, ground);
      }
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', hidden);
      outbox.close();
      buttons.stop();
      view.stop();
      unhook();
    },
  };
}
