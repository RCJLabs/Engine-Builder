/**
 * A 2D space drawn by its own stage (M7.4, D86, docs/specs/stages.md#where-it-runs): stage2d's sim side
 * runs as for any 2D space (walkers, arrivals, clock, uses), and the drawing is the stage's, in its
 * worker on the canvas handed to it. Each animation frame the walk steps; a frame goes to the worker
 * only once it answered the last. The uses are the page's own buttons where the stage says they are.
 * A stage that throws is stopped and said over the box; the space goes on. Since M7.5 a battle on the space's
 * tilemap is played through the page's bar (battle2d/onCode.ts) and drawn by the stage from Frame.battle.
 */
import { FIT_DEFAULT, type SpaceJson } from '@eb/compiler';
import type { PackWorld } from '@eb/core';
import type { SpaceAsk, SpaceDrawn } from '@eb/ui';
import { battleOnCode } from '../battle2d/onCode.ts';
import { publishHook } from '../stage2d/hook.ts';
import type { Rect } from '../stage2d/place.ts';
import { placesOf, sceneOf } from '../stage2d/scene.ts';
import { createSimSide } from '../stage2d/simSide.ts';
import { createUseButtons } from '../stage2d/useButtons.ts';
import { showStageError, stageErrorText } from './alert.ts';
import type { Start, UseBox } from './api.ts';
import { startStageWorker } from './client.ts';
import { FRAME_CAP_S, frameOf, MOST_DPR } from './frames.ts';
import { captureInput } from './input.ts';
import { sheetsByPath } from './sheets.ts';

export async function startCodeStage(
  box: HTMLElement,
  ask: SpaceAsk,
  world: PackWorld,
  entry: string,
): Promise<SpaceDrawn> {
  const space = world.spaces[ask.space] as SpaceJson;
  const record = (key: string) => (Object.hasOwn(world.records, key) ? world.records[key] : undefined);
  let taken = new Set(ask.taken);
  let items = sceneOf(space, world.prefabs, record, taken);
  const places = placesOf(space, world.prefabs);
  const tiles = world.tiles?.[ask.space];
  const building = world.buildings?.[ask.space];
  const sim = createSimSide(ask, world, items, places, {
    ...(tiles ? { tiles } : {}),
    ...(building ? { building } : {}),
  });
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const canvas = document.createElement('canvas');
  canvas.className = 'eb-stage-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${space.name}: drag, pinch or use the arrow keys to look around`);
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });
  box.append(canvas);
  const inputs = captureInput(canvas);
  const buttons = createUseButtons(box, sim.use, () => {});
  const usesHere = () => sim.usesOf(new Set(items.map((i) => i.path)));
  // While a battle is fought its bar is the only thing to press (M7.5).
  let fighting = false;
  const showUses = () => buttons.set(fighting ? [] : usesHere());
  showUses();

  let frames = 0;
  let lastMs = 0;
  let boxes = new Map<string, Rect>();
  let error: string | undefined;
  let hideError = () => {};
  const fail = (message: string, file?: string, line?: number) => {
    error = stageErrorText(message, file, line);
    hideError = showStageError(box, error);
  };
  const placeUses = (uses: readonly UseBox[]) => {
    boxes = new Map(uses.map(({ object, box: [x, y, w, h] }) => [object, { x, y, w, h }]));
    buttons.placeAt(boxes);
  };
  buttons.placeAt(boxes);
  const battle = tiles
    ? battleOnCode(box, canvas, ask, world, tiles, (on) => {
        fighting = on;
        showUses();
        buttons.placeAt(boxes);
      })
    : undefined;

  const start: Start = {
    space: ask.space,
    size: (space.size ?? space.fit ?? FIT_DEFAULT) as readonly [number, number],
    world: {
      space,
      prefabs: world.prefabs,
      records: world.records,
      ...(tiles ? { tiles } : {}),
      ...(building ? { building } : {}),
      uses: Object.fromEntries(
        Object.entries(world.uses?.[ask.space] ?? {}).map(([path, u]) => [path, { label: u.label }]),
      ),
    },
    places: Object.fromEntries(places),
    sheets: Object.fromEntries(await sheetsByPath(world)),
  };
  // Safari before 16.4 has no 2D OffscreenCanvas: the space goes on, saying why it isn't drawn.
  const offscreen = typeof canvas.transferControlToOffscreen === 'function';
  if (!offscreen)
    fail('This browser can’t draw a stage off the page: it needs a 2D OffscreenCanvas (Safari 16.4 or newer)');
  const client = offscreen
    ? startStageWorker(canvas.transferControlToOffscreen(), world.stages ?? {}, entry, start, {
        started: () => {},
        drew: (uses, ms, picked) => {
          frames++;
          lastMs = ms;
          if (uses) placeUses(uses);
          if (picked) battle?.picked(picked);
        },
        failed: fail,
      })
    : undefined;

  let size = { w: box.clientWidth, h: box.clientHeight };
  const sized = new ResizeObserver(() => {
    size = { w: box.clientWidth, h: box.clientHeight };
  });
  sized.observe(box);

  let stopped = false;
  let last = performance.now();
  const born = last;
  let sentAt = born;
  const frame = (now: number) => {
    const dt = Math.min(FRAME_CAP_S, (now - last) / 1000);
    last = now;
    sim.step(dt, now);
    // Every frame, so the playback and the bar keep the page's time whether or not the worker takes this one.
    const fight = battle?.frame(now);
    // Input waits for a frame the worker will take, so none is lost to a dropped frame.
    if (!client?.idle() || error !== undefined) return;
    const input = inputs.take();
    client.frame(
      frameOf({
        now,
        born,
        sentAt,
        box: size,
        devicePixelRatio: window.devicePixelRatio,
        still,
        walkers: sim.walkers.values(),
        world: { here: ask.here(), fight: ask.fight?.(), markers: ask.markers?.() ?? [] },
        ...(fight ? { battle: fight } : {}),
        taken,
        input: sim.paused() ? [] : input,
      }),
    );
    sentAt = now;
  };
  let raf = 0;
  const loop = (now: number) => {
    if (stopped) return;
    frame(now);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const unhook = publishHook({
    space: ask.space,
    scaled: () => ({ scale: 1, cols: size.w, rows: size.h, dpr: Math.min(MOST_DPR, window.devicePixelRatio || 1) }),
    camera: () => [0, 0],
    drawn: () => [],
    frames: () => frames,
    uses: () => buttons.shown(),
    used: sim.used,
    walkers: () =>
      [...sim.walkers.values()].map((w) => ({
        actor: w.actor,
        at: w.at,
        goal: w.goal,
        moving: w.moving,
        flip: w.flip,
      })),
    building: () => undefined,
    tilemap: () => undefined,
    npcsSent: sim.tellSent,
    clock: sim.clockHook,
    look: () => {},
    boxOf: () => undefined,
    battle: () => battle?.hook(),
    code: () => ({
      stage: entry,
      frames,
      ms: lastMs,
      boxed: [...boxes.keys()].sort(),
      unboxed: usesHere()
        .map((u) => u.path)
        .filter((path) => !boxes.has(path)),
      ...(error !== undefined ? { error } : {}),
    }),
  });

  return {
    pause: sim.pause,
    quality() {},
    taken(paths) {
      taken = new Set(paths);
      items = sceneOf(space, world.prefabs, record, taken);
      showUses();
      buttons.placeAt(boxes);
    },
    npcs: sim.npcs,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      sized.disconnect();
      sim.stop();
      client?.stop();
      battle?.stop();
      inputs.stop();
      buttons.stop();
      hideError();
      canvas.remove();
      unhook();
    },
  };
}
