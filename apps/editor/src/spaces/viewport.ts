/**
 * The Scene panel's view (M5.1, D8, D63, docs/specs/viewport.md#the-scene-panel): three's
 * WebGPURenderer, on WebGPU where the browser has it and WebGL2 where it doesn't; the editor's
 * light and grid; the camera; picking; the gizmo where the chosen objects are; a space's terrain
 * (M5.3), in terrainView.ts; its environment (M5.4), in environmentView.ts; its models (M5.5), in
 * viewModels.ts; its foliage (M5.6), in foliageView.ts. It draws only when something changes, so a
 * still editor spends nothing on it, unless rain or snow is falling.
 */

import type { TerrainJson } from '@eb/compiler';
import * as THREE from 'three/webgpu';
import { characterReady } from '../anim/character.ts';
import { noteError } from '../app/state.ts';
import type { Look } from '../environment/look.ts';
import type { LiveModels } from '../models/liveTypes.ts';
import type { NavLook } from '../nav/protocol.ts';
import { frameStats } from '../perf/frames.ts';
import { createFrameClock } from '../perf/stepDown.ts';
import { pixelRatioOf, TIERS, type TierSettings } from '../perf/tiers.ts';
import type { MapShot } from '../spaceMaps/shot.ts';
import { type Boxed, LATCH_PX, type Latch, union } from './bounds.ts';
import { type Built, createBuilder, type NameOf, setTransform } from './build.ts';
import { type Drag, startDrag } from './drag.ts';
import { createEnvironmentView } from './environmentView.ts';
import type { FigureOf } from './figureLook.ts';
import { figuresIn } from './figureView.ts';
import { createFoliageView, type FoliageShown } from './foliageView.ts';
import { drawFromAbove } from './fromAbove.ts';
import { AXES, type Handle, type Mode, metresFor, onPlane, type Placed, pivotOf, type Ray } from './gizmoMath.ts';
import { createGizmo } from './gizmoView.ts';
import { gripsOf, hitHandle, ownAxes, type Project, type Screen, shapesOf } from './handles.ts';
import { lodsOf } from './meshes.ts';
import { createNavOverlay } from './navOverlay.ts';
import { eyeOf, FOV, framed, type Orbit, START } from './orbit.ts';
import { perfSummary } from './perfSummary.ts';
import { castShadows, fitShadowsTo, sunShadows } from './shadows.ts';
import { boxesOf, createLatchWires } from './snapView.ts';
import { placedOf, type SpaceJson } from './spaceFile.ts';
import { createTerrainView, type TerrainFiles, type TerrainView } from './terrainView.ts';
import { quatOfTurn, type Vec3 } from './vec.ts';
import { createViewModels } from './viewModels.ts';
import { clearHook, type PerfSummary, setHook, type ViewportHook, waterOpacity } from './viewportHook.ts';

/** How long the gizmo's arms are on screen: a fifth of the view's short side, within these. */
const GIZMO_PX = { least: 72, most: 120, share: 0.22 } as const;

export type Backend = 'webgpu' | 'webgl';

export interface View {
  readonly backend: Backend;
  readonly canvas: HTMLCanvasElement;
  /** The view's size in CSS pixels. */
  size(): { readonly w: number; readonly h: number };
  orbit(): Orbit;
  setOrbit(next: Orbit): void;
  rayAt(at: Screen): Ray;
  /** The file's object under a point of the view, or null for empty ground. */
  pick(at: Screen): string | null;
  /** The gizmo's handle within reach of a point, when objects are chosen. */
  handleAt(at: Screen): Handle | null;
  /** Takes hold of a handle: the drag, or null with nothing chosen; a move on a grid of `step` metres, latching onto the other objects' boxes. */
  grab(handle: Handle, at: Screen, step?: number): { drag: Drag; objects: readonly Placed[] } | null;
  /** The boxes a drag has latched onto, drawn as wires; none once it ends (M5.10). */
  latched(latches: readonly Latch[]): void;
  /** Each of the file's objects' boxes as drawn (M5.10). */
  boxes(): Boxed[];
  /** Shows the chosen objects where a drag has them, or back where their file has them (null). */
  preview(placed: readonly Placed[] | null): void;
  light(handle: Handle | null): void;
  show(
    space: SpaceJson,
    prefabs: ReadonlyMap<string, SpaceJson>,
    names?: NameOf,
    models?: LiveModels,
    figures?: FigureOf,
  ): void;
  /** A space's environment as the view draws it, or none for the editor's own light (M5.4). */
  showEnvironment(look: Look | null): void;
  /** A space's terrain, or none: a problem in words when its files can't be read. */
  showTerrain(settings: TerrainJson | null, files: TerrainFiles | null): string | null;
  /** The foliage types the terrain lists (M5.6), in its order: its channels. */
  showFoliage(list: readonly FoliageShown[]): void;
  /** The navmesh over the view, or none (M6.2). */
  showNav(look: NavLook | null): void;
  /** The terrain's brushes and strokes (M5.3), over rays from the view's points. */
  readonly terrain: Pick<TerrainView, 'start' | 'to' | 'end' | 'ring' | 'grid' | 'height'>;
  select(ids: readonly string[]): void;
  setMode(mode: Mode): void;
  /** The chosen objects in view, or the whole space when none are. */
  frame(): void;
  /** The ground in the middle of the view. */
  aim(): Vec3;
  /** The tier drawn, its settings as three has them, and its frames (M5.7). */
  perf(): PerfSummary;
  /** The space drawn once from above for its map (M6.6), lit by the editor's own light. */
  bakeMap(shot: MapShot): HTMLCanvasElement;
  draw(): void;
  dispose(): void;
}

/** A frame asked for within this many ms of the last one ending is drawn back to back. */
const BACK_TO_BACK = 20;

const cssColor = (host: HTMLElement, name: string, fallback: string) =>
  getComputedStyle(host).getPropertyValue(name).trim() || fallback;

/**
 * The view at a quality tier (M5.7, D69): antialiasing is the renderer's from the start, so a tier
 * that changes it makes a new view. `onLong` hears when frames drawn back to back run long.
 */
export async function createView(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  tier: TierSettings = TIERS.high,
  onLong: () => void = () => {},
): Promise<View> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: tier.antialias });
  await renderer.init();
  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cssColor(host, '--surface-2', '#262a31'));
  const skyLight = new THREE.HemisphereLight(0xffffff, 0x3a4250, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 12, 8);
  scene.add(skyLight, sun);
  sunShadows(renderer, sun, tier.shadowMap);
  const environment = createEnvironmentView(
    scene,
    { sky: skyLight, sun },
    { physicalSky: tier.physicalSky, weatherShare: tier.weatherShare },
  );
  // A metre a square, 60 m across: the editor's, never saved. Wider, its far lines shimmer into a band.
  const grid = new THREE.GridHelper(60, 60, cssColor(host, '--muted', '#a9b0ba'), cssColor(host, '--line', '#343a43'));
  scene.add(grid);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 2000);
  const raycaster = new THREE.Raycaster();
  const builder = createBuilder();
  const outlines = new THREE.Group();
  scene.add(outlines);
  const wires = createLatchWires(scene, cssColor(host, '--accent', '#6cb4ff'));
  const gizmo = createGizmo();
  scene.add(gizmo.group);
  // draw is hoisted: the terrain asks for a frame as a stroke lands, and tells the foliage what changed.
  const terrain = createTerrainView(
    cssColor(host, '--accent', '#6cb4ff'),
    () => draw(),
    (area) => foliage.changed(area),
  );
  const foliage = createFoliageView(() => draw(), terrain.grid, {
    reach: tier.foliageReach,
    share: tier.foliageShare,
    shadows: tier.foliageShadows && tier.shadowMap > 0,
  });
  scene.add(terrain.root, foliage.root);
  const navOverlay = createNavOverlay(scene, () => draw());
  // Placed records' names (M5.2), drawn by the page over the canvas: sharp at any size, and words a
  // screen reader skips, as the outliner names the same objects.
  const labelLayer = document.createElement('div');
  labelLayer.className = 'scene-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  host.append(labelLayer);
  let labels: { readonly at: THREE.Object3D; readonly box: HTMLSpanElement }[] = [];

  let orbit = START;
  let built: Built | null = null;
  // The environment shown, put back after a map is drawn in the editor's own light.
  let look: Look | null = null;
  // The models' LODs, their levels picked for this camera alone (modelParts.ts's withLevels).
  let lods: THREE.LOD[] = [];
  let filed = new Map<string, Placed>();
  let draft: ReadonlyMap<string, Placed> | null = null;
  let chosen: readonly string[] = [];
  let mode: Mode = 'move';
  let size = { w: 1, h: 1 };
  let frames = 0;
  let asked = false;
  // When the last frame ended: a frame asked for straight after it is drawn back to back.
  let lastEnd = Number.NEGATIVE_INFINITY;
  const clock = createFrameClock();
  let gone = false;

  const placedNow = (id: string) => draft?.get(id) ?? filed.get(id);
  const chosenPlaced = () => chosen.flatMap((id) => placedNow(id) ?? []);

  /** The gizmo's footing: where it stands, how many metres long, and along which axes. */
  const footing = () => {
    const objects = chosenPlaced();
    if (objects.length === 0) return null;
    const pivot = pivotOf(objects);
    const px = Math.min(GIZMO_PX.most, Math.max(GIZMO_PX.least, GIZMO_PX.share * Math.min(size.w, size.h)));
    const metres = metresFor(px, camera.position.distanceTo(new THREE.Vector3(...pivot)), FOV, size.h);
    // Scaling one object goes along its own axes; moving and turning, along the world's.
    const own = mode === 'scale' && objects.length === 1 ? quatOfTurn((objects[0] as Placed).turn) : null;
    return { pivot, metres, own, axes: own ? ownAxes(own) : [...AXES] };
  };

  const project: Project = (point) => {
    const v = new THREE.Vector3(point[0], point[1], point[2]);
    if (v.clone().applyMatrix4(camera.matrixWorldInverse).z > -camera.near) return null;
    v.project(camera);
    return [((v.x + 1) / 2) * size.w, ((1 - v.y) / 2) * size.h];
  };

  const shapes = () => {
    const at = footing();
    return at ? shapesOf(mode, at.pivot, at.metres, at.axes) : [];
  };

  const rayAt = ([x, y]: Screen): Ray => {
    raycaster.setFromCamera(new THREE.Vector2((x / size.w) * 2 - 1, 1 - (y / size.h) * 2), camera);
    const { origin, direction } = raycaster.ray;
    return { origin: [origin.x, origin.y, origin.z], dir: [direction.x, direction.y, direction.z] };
  };

  const pick = (at: Screen): string | null => {
    if (!built) return null;
    raycaster.setFromCamera(new THREE.Vector2((at[0] / size.w) * 2 - 1, 1 - (at[1] / size.h) * 2), camera);
    const [hit] = raycaster.intersectObjects(built.root.children, true);
    return hit ? builder.idOf(hit.object) : null;
  };

  // show is hoisted: a model whose file finishes decoding builds the view again.
  const models = createViewModels(
    renderer,
    () => {
      if (shown) show(...shown);
    },
    noteError,
  );
  let shown: Parameters<View['show']> | null = null;
  // The starter character's file (M6.5), fetched with the first figure drawn: the view builds again once it is read.
  let figuresLoading = false;
  const loadFigures = () => {
    if (figuresLoading) return;
    figuresLoading = true;
    void import('../anim/characterLoad.ts')
      .then((load) => load.loadCharacter())
      .then(
        () => {
          if (shown && !gone) show(...shown);
        },
        (error: unknown) => noteError(`The starter character can’t be drawn: ${String(error)}`),
      );
  };

  const outline = () => {
    models.wire(chosen.flatMap((id) => built?.byId.get(id) ?? []));
    for (const helper of outlines.children) (helper as THREE.Box3Helper).geometry.dispose();
    outlines.clear();
    for (const id of chosen) {
      const object = built?.byId.get(id);
      if (!object) continue;
      object.updateMatrixWorld(true);
      outlines.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(object), cssColor(host, '--accent', '#6cb4ff')));
    }
  };

  function draw() {
    if (asked) return;
    asked = true;
    const askedAt = performance.now();
    requestAnimationFrame((time) => {
      asked = false;
      // A frame asked for just before the view went: the panel closed, its meshes already freed.
      if (gone) return;
      const at = footing();
      gizmo.group.visible = at !== null;
      if (at) gizmo.place(at.pivot, at.metres, at.own);
      const eye: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      terrain.levels(eye);
      foliage.levels(eye);
      // Where each stands now, not where render() last left it: the view draws only when asked.
      for (const lod of lods) {
        lod.updateWorldMatrix(true, false);
        lod.update(camera);
      }
      environment.frame(camera, orbit.target, performance.now());
      renderer.render(scene, camera);
      placeLabels();
      frames++;
      const long = clock.frame(time, askedAt - lastEnd <= BACK_TO_BACK);
      lastEnd = performance.now();
      if (long) onLong();
      // Falling weather is drawn every frame; everything else waits to be asked.
      if (environment.animating()) draw();
    });
  }

  function show(...args: Parameters<View['show']>) {
    const [space, prefabs, names, live, figures] = args;
    shown = args;
    if (built) {
      scene.remove(built.root);
      built.dispose();
    }
    const drawModel = models.use(live);
    built = builder.build(space, prefabs, names, drawModel, false, figures);
    if (!characterReady() && figuresIn(built.root).length > 0) loadFigures();
    if (tier.shadowMap > 0) castShadows(built.root);
    lods = lodsOf(built.root);
    foliage.models(drawModel);
    scene.add(built.root);
    labelLayer.replaceChildren();
    fitShadows();
    labels = built.labels.map(({ text, at }) => {
      const box = document.createElement('span');
      box.className = 'scene-label';
      box.textContent = text;
      labelLayer.append(box);
      return { at, box };
    });
    filed = new Map(space.objects.map((o) => [o.id, placedOf(o)]));
    draft = null;
    outline();
    draw();
  }

  const fitShadows = () => {
    if (tier.shadowMap > 0) fitShadowsTo(sun, terrain.grid(), built?.root);
  };

  const placeLabels = () => {
    const world = new THREE.Vector3();
    for (const { at, box } of labels) {
      at.getWorldPosition(world);
      const spot = project([world.x, world.y + 0.5, world.z]);
      box.hidden = spot === null;
      if (spot)
        box.style.transform = `translate(${spot[0].toFixed(1)}px, ${spot[1].toFixed(1)}px) translate(-50%, -100%)`;
    }
  };

  const setOrbit = (next: Orbit) => {
    orbit = next;
    const eye = eyeOf(orbit);
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.lookAt(orbit.target[0], orbit.target[1], orbit.target[2]);
    camera.updateMatrixWorld();
    draw();
  };

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    size = { w, h };
    renderer.setPixelRatio(pixelRatioOf(tier, window.devicePixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    setOrbit(orbit);
  };
  const watcher = new ResizeObserver(resize);
  watcher.observe(host);
  resize();

  const page = (at: Screen) => {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + at[0], y: rect.top + at[1] };
  };

  /** Whether a point of the view is on screen, not scrolled under a tab bar or past the page's edge. */
  const shows = (at: Screen) => {
    const { x, y } = page(at);
    return document.elementFromPoint(x, y) === canvas;
  };

  /** A point on the object, clear of every handle unless `underHandles`, and in sight: the middle of its box first. */
  const objectAt = (id: string, underHandles = false) => {
    const object = built?.byId.get(id);
    if (!object) return null;
    const box = new THREE.Box3().setFromObject(object);
    const corners = [box.min, box.max].flatMap((a) =>
      [box.min, box.max].flatMap((b) => [box.min, box.max].map((c) => project([a.x, b.y, c.z]))),
    );
    const seen = corners.filter((c): c is Screen => c !== null);
    if (seen.length === 0) return null;
    const [x0, x1] = [Math.min(...seen.map((c) => c[0])), Math.max(...seen.map((c) => c[0]))];
    const [y0, y1] = [Math.min(...seen.map((c) => c[1])), Math.max(...seen.map((c) => c[1]))];
    const handles = shapes();
    const spots: Screen[] = [];
    for (let i = 1; i < 8; i++)
      for (let j = 1; j < 8; j++) spots.push([x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * j) / 8]);
    const middle: Screen = [(x0 + x1) / 2, (y0 + y1) / 2];
    spots.sort(
      (a, b) => Math.hypot(a[0] - middle[0], a[1] - middle[1]) - Math.hypot(b[0] - middle[0], b[1] - middle[1]),
    );
    const spot = spots.find(
      (s) => shows(s) && pick(s) === id && (underHandles || hitHandle(handles, project, s) === null),
    );
    return spot ? page(spot) : null;
  };

  const hook: ViewportHook = {
    backend,
    get frames() {
      return frames;
    },
    grips: () => {
      const at = footing();
      return at
        ? gripsOf(shapes(), project, at.pivot, shows).map((g) => ({ name: g.name, ...page(g.at), along: g.along }))
        : [];
    },
    objectAt,
    screenOf: (point) => {
      const spot = project(point);
      return spot ? page(spot) : null;
    },
    boxes: () => boxesOf(built?.byId ?? new Map()),
    latched: () => wires.latched(),
    camera: () => orbit,
    terrain: () => terrain.summary(),
    groundAt(x, z) {
      const y = terrain.height(x, z);
      const spot = y === null ? null : project([x, y, z]);
      return spot && shows(spot) ? page(spot) : null;
    },
    heightAt: terrain.height,
    paintAt: terrain.paint,
    waterAt: (id) => waterOpacity(built?.byId.get(id)),
    environment: () => environment.summary(),
    models: () => models.summaries(built?.root),
    figures: () => figuresIn(built?.root),
    foliage: () => foliage.summary(),
    plantsNear: foliage.near,
    perf,
    nav: () => navOverlay.summary(),
  };
  setHook(hook);

  function perf(): PerfSummary {
    return perfSummary({
      tier,
      backend,
      renderer,
      sun,
      objects: built?.root,
      ground: terrain.chunks,
      foliageShadows: foliage.summary().some((f) => f.shadows),
      sky: environment.summary()?.sky ?? null,
      frames: frameStats(clock.intervals()),
    });
  }

  return {
    backend,
    canvas,
    size: () => size,
    orbit: () => orbit,
    setOrbit,
    rayAt,
    pick,
    handleAt: (at) => hitHandle(shapes(), project, at),
    grab(handle, at, step) {
      const foot = footing();
      const objects = chosenPlaced();
      if (!foot || objects.length === 0) return null;
      const all = boxesOf(built?.byId ?? new Map());
      const moving = union(all.filter((b) => chosen.includes(b.id)).map((b) => b.box));
      // 12 px on screen at the gizmo's distance, in metres.
      const tolerance = metresFor(LATCH_PX, camera.position.distanceTo(new THREE.Vector3(...foot.pivot)), FOV, size.h);
      const others = all.filter((b) => !chosen.includes(b.id));
      return {
        drag: startDrag({
          handle,
          pivot: foot.pivot,
          axes: foot.axes,
          objects,
          ray: rayAt(at),
          screen: at,
          ...(step === undefined ? {} : { step }),
          ...(moving ? { boxes: { moving, others, tolerance } } : {}),
        }),
        objects,
      };
    },
    latched(latches) {
      if (latches.length === 0 && wires.latched().length === 0) return;
      wires.show(latches, latches.length === 0 ? [] : boxesOf(built?.byId ?? new Map()));
      draw();
    },
    boxes: () => boxesOf(built?.byId ?? new Map()),
    preview(placed) {
      draft = placed ? new Map(placed.map((p) => [p.id, p])) : null;
      for (const id of chosen) {
        const object = built?.byId.get(id);
        const now = placedNow(id);
        if (object && now) setTransform(object, now);
      }
      outline();
      draw();
    },
    light(handle) {
      if (gizmo.light(handle)) draw();
    },
    show,
    showEnvironment(next) {
      look = next;
      environment.show(next);
      // The sun moved: its shadow camera with it.
      fitShadows();
      draw();
    },
    showTerrain(settings, files) {
      const problem = terrain.show(settings, files);
      // The terrain is the ground: the editor's grid would only flicker through it.
      grid.visible = terrain.grid() === null;
      fitShadows();
      draw();
      return problem;
    },
    showFoliage(list) {
      foliage.show(list);
    },
    bakeMap(shot) {
      // A map reads the same at any hour: the editor's own light, no sky, weather or fog, and the sun
      // high in the north-west, as maps are lit, its shadows short.
      environment.show(null);
      const keep = new Set<THREE.Object3D>([skyLight, sun, terrain.root, foliage.root, ...(built ? [built.root] : [])]);
      const was = sun.position.clone();
      sun.position.set(-3, 10, -3);
      fitShadows();
      try {
        return drawFromAbove(renderer, scene, keep, shot, (eye) => {
          terrain.levels(eye);
          foliage.levels(eye);
        });
      } finally {
        sun.position.copy(was);
        environment.show(look);
        fitShadows();
        draw();
      }
    },
    showNav: (look) => navOverlay.show(look),
    terrain,
    select(ids) {
      chosen = ids;
      outline();
      draw();
    },
    setMode(next) {
      mode = next;
      gizmo.show(next);
      draw();
    },
    frame() {
      const ids = chosen.length > 0 ? chosen : [...(built?.byId.keys() ?? [])];
      const box = new THREE.Box3();
      for (const id of ids) {
        const object = built?.byId.get(id);
        if (object) box.expandByObject(object);
      }
      if (chosen.length === 0 && terrain.grid()) box.expandByObject(terrain.chunks);
      if (box.isEmpty()) return setOrbit({ ...START, yaw: orbit.yaw, pitch: orbit.pitch });
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      setOrbit(framed(orbit, [sphere.center.x, sphere.center.y, sphere.center.z], sphere.radius));
    },
    perf,
    aim() {
      const middle = rayAt([size.w / 2, size.h / 2]);
      return terrain.ground(middle) ?? onPlane(middle, [0, 0, 0], [0, 1, 0]) ?? orbit.target;
    },
    draw,
    dispose() {
      gone = true;
      watcher.disconnect();
      labelLayer.remove();
      clearHook(hook);
      built?.dispose();
      chosen = [];
      outline();
      builder.dispose();
      gizmo.dispose();
      wires.dispose();
      terrain.dispose();
      foliage.dispose();
      navOverlay.dispose();
      environment.dispose();
      models.dispose();
      grid.dispose();
      renderer.dispose();
    },
  };
}
