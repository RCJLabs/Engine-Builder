/**
 * The Scene panel's view (M5.1, D8, D63, docs/specs/viewport.md#the-scene-panel): three's
 * WebGPURenderer, on WebGPU where the browser has it and WebGL2 where it doesn't; the editor's
 * light and grid; the camera; picking; the gizmo where the chosen objects are. It draws only when
 * something changes, so a still editor spends nothing on it.
 */
import * as THREE from 'three/webgpu';
import { type Built, createBuilder, setTransform } from './build.ts';
import { type Drag, startDrag } from './drag.ts';
import { AXES, type Handle, type Mode, metresFor, onPlane, type Placed, pivotOf, type Ray } from './gizmoMath.ts';
import { createGizmo } from './gizmoView.ts';
import { gripsOf, hitHandle, ownAxes, type Project, type Screen, shapesOf } from './handles.ts';
import { eyeOf, FOV, framed, type Orbit, START } from './orbit.ts';
import { placedOf, type SpaceJson } from './spaceFile.ts';
import { quatOfTurn, type Vec3 } from './vec.ts';

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
  /** Takes hold of a handle: the drag, or null with nothing chosen. */
  grab(handle: Handle, at: Screen): { drag: Drag; objects: readonly Placed[] } | null;
  /** Shows the chosen objects where a drag has them, or back where their file has them (null). */
  preview(placed: readonly Placed[] | null): void;
  light(handle: Handle | null): void;
  show(space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>): void;
  select(ids: readonly string[]): void;
  setMode(mode: Mode): void;
  /** The chosen objects in view, or the whole space when none are. */
  frame(): void;
  /** The ground in the middle of the view. */
  aim(): Vec3;
  draw(): void;
  dispose(): void;
}

/** What the e2e reads (window.__ebViewport): where to take hold of each handle and each object, in page pixels. */
export interface ViewportHook {
  readonly backend: Backend;
  readonly frames: number;
  readonly grips: () => { name: string; x: number; y: number; along: Screen }[];
  readonly objectAt: (id: string) => { x: number; y: number } | null;
  readonly camera: () => Orbit;
}

type Hooked = { __ebViewport?: ViewportHook };
const hooked = () => window as unknown as Hooked;

const cssColor = (host: HTMLElement, name: string, fallback: string) =>
  getComputedStyle(host).getPropertyValue(name).trim() || fallback;

export async function createView(host: HTMLElement, canvas: HTMLCanvasElement): Promise<View> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cssColor(host, '--surface-2', '#262a31'));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 12, 8);
  scene.add(sun);
  // A metre a square, 60 m across: the editor's, never saved. Wider, its far lines shimmer into a band.
  const grid = new THREE.GridHelper(60, 60, cssColor(host, '--muted', '#a9b0ba'), cssColor(host, '--line', '#343a43'));
  scene.add(grid);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 2000);
  const raycaster = new THREE.Raycaster();
  const builder = createBuilder();
  const outlines = new THREE.Group();
  scene.add(outlines);
  const gizmo = createGizmo();
  scene.add(gizmo.group);

  let orbit = START;
  let built: Built | null = null;
  let filed = new Map<string, Placed>();
  let draft: ReadonlyMap<string, Placed> | null = null;
  let chosen: readonly string[] = [];
  let mode: Mode = 'move';
  let size = { w: 1, h: 1 };
  let frames = 0;
  let asked = false;

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

  const outline = () => {
    for (const helper of outlines.children) (helper as THREE.Box3Helper).geometry.dispose();
    outlines.clear();
    for (const id of chosen) {
      const object = built?.byId.get(id);
      if (!object) continue;
      object.updateMatrixWorld(true);
      outlines.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(object), cssColor(host, '--accent', '#6cb4ff')));
    }
  };

  const draw = () => {
    if (asked) return;
    asked = true;
    requestAnimationFrame(() => {
      asked = false;
      const at = footing();
      gizmo.group.visible = at !== null;
      if (at) gizmo.place(at.pivot, at.metres, at.own);
      renderer.render(scene, camera);
      frames++;
    });
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

  /** A point on the object, clear of every handle: the middle of its box first. */
  const objectAt = (id: string) => {
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
    const inside = (s: Screen) => s[0] >= 0 && s[1] >= 0 && s[0] <= size.w && s[1] <= size.h;
    const spot = spots.find((s) => inside(s) && pick(s) === id && hitHandle(handles, project, s) === null);
    return spot ? page(spot) : null;
  };

  hooked().__ebViewport = {
    backend,
    get frames() {
      return frames;
    },
    grips: () => {
      const at = footing();
      return at
        ? gripsOf(shapes(), project, at.pivot).map((g) => ({ name: g.name, ...page(g.at), along: g.along }))
        : [];
    },
    objectAt,
    camera: () => orbit,
  };

  return {
    backend,
    canvas,
    size: () => size,
    orbit: () => orbit,
    setOrbit,
    rayAt,
    pick,
    handleAt: (at) => hitHandle(shapes(), project, at),
    grab(handle, at) {
      const foot = footing();
      const objects = chosenPlaced();
      if (!foot || objects.length === 0) return null;
      return {
        drag: startDrag({ handle, pivot: foot.pivot, axes: foot.axes, objects, ray: rayAt(at), screen: at }),
        objects,
      };
    },
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
    show(space, prefabs) {
      if (built) {
        scene.remove(built.root);
        built.dispose();
      }
      built = builder.build(space, prefabs);
      scene.add(built.root);
      filed = new Map(space.objects.map((o) => [o.id, placedOf(o)]));
      draft = null;
      outline();
      draw();
    },
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
      if (box.isEmpty()) return setOrbit({ ...START, yaw: orbit.yaw, pitch: orbit.pitch });
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      setOrbit(framed(orbit, [sphere.center.x, sphere.center.y, sphere.center.z], sphere.radius));
    },
    aim() {
      return onPlane(rayAt([size.w / 2, size.h / 2]), [0, 0, 0], [0, 1, 0]) ?? orbit.target;
    },
    draw,
    dispose() {
      watcher.disconnect();
      if (hooked().__ebViewport?.objectAt === objectAt) delete hooked().__ebViewport;
      built?.dispose();
      chosen = [];
      outline();
      builder.dispose();
      gizmo.dispose();
      grid.dispose();
      renderer.dispose();
    },
  };
}
