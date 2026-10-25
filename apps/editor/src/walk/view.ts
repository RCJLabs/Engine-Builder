/**
 * The walk's view (M5.8, D70, docs/specs/movement.md#the-stage): a space drawn as the Scene panel
 * draws it (build.ts, the terrain, environment, foliage and models views), at a quality tier, with
 * no grid, gizmo or labels, from wherever the stage's camera stands. The stage asks for every frame.
 * M5.10 (D72, docs/specs/streaming.md): it draws the objects near, built a few a frame, and the
 * models of those far, instanced at their coarsest level; fog closes at the tier's view distance.
 */

import * as THREE from 'three/webgpu';
import { lookOf as environmentLook } from '../environment/look.ts';
import { frameStats } from '../perf/frames.ts';
import { pixelRatioOf, type TierSettings } from '../perf/tiers.ts';
import { createBuilder } from '../spaces/build.ts';
import { createEnvironmentView } from '../spaces/environmentView.ts';
import { createFoliageView } from '../spaces/foliageView.ts';
import { perfSummary } from '../spaces/perfSummary.ts';
import { fitShadowsTo, sunShadows } from '../spaces/shadows.ts';
import { createTerrainView } from '../spaces/terrainView.ts';
import type { Quat, Vec3 } from '../spaces/vec.ts';
import { createViewModels } from '../spaces/viewModels.ts';
import type { PerfSummary } from '../spaces/viewportHook.ts';
import type { Shot } from './cameras.ts';
import { createFarModels } from './farModels.ts';
import { closeFog, DAYLIGHT } from './fog.ts';
import type { Placement } from './footprints.ts';
import { createNearObjects, nodeAt } from './nearObjects.ts';
import { createNpcView } from './npcView.ts';
import { BODY, topOf } from './physics.ts';
import type { Solid } from './solids.ts';
import { createTapMarker, rayFrom, screenFrom } from './tapMarker.ts';
import type { WalkSpace } from './world.ts';

const FOV = 70;

export interface WalkView {
  readonly canvas: HTMLCanvasElement;
  /** One frame from where the camera stands: the character drawn in third person, the moving solids where they are. */
  frame(
    shot: Shot,
    feet: Vec3,
    yaw: number,
    body: boolean,
    moving: readonly { path: string; at: Vec3; turn: Quat }[],
  ): void;
  perf(frames: readonly number[]): PerfSummary;
  /** Objects taken (M5.9): drawn no more, with everything inside them, as soon as the sim says so. */
  hide(taken: ReadonlySet<string>): void;
  /** The taken objects the scene has and doesn't draw, as three holds them: the hook's check. */
  hidden(): string[];
  /** The objects near (M5.10): those not built yet are built, in this order, a few a frame. */
  near(ids: ReadonlySet<string>, order: readonly string[]): void;
  /** Builds all that waits now: the walk's start and a respawn, under the loading screen. */
  settle(): void;
  /** Draws these placements' models far, and these water objects. */
  far(placements: readonly Placement[], water: readonly string[]): void;
  /** The NPCs (M6.1): one turned to face the player as its Talk is used, and back as the walk goes on. */
  readonly npcs: Pick<
    ReturnType<typeof createNpcView>,
    'isNpc' | 'face' | 'back' | 'turning' | 'list' | 'built' | 'place'
  >;
  /** Tap to move (M6.2): the ray through a point of the view, and the ring where the player is going. */
  ray(x: number, y: number): { from: Vec3; dir: Vec3 };
  screenOf(p: Vec3): [number, number] | null;
  readonly marker: ReturnType<typeof createTapMarker>;
  streaming(): {
    readonly built: string[];
    readonly waiting: number;
    readonly slowest: number;
    readonly far: { readonly models: number; readonly meshes: number; readonly levels: readonly number[] };
  };
  readonly frames: number;
  dispose(): void;
}

/** The character: a capsule its own height, a little nose to show which way it faces. */
function bodyMesh(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#d9643a', roughness: 0.6 });
  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(BODY.radius, BODY.height - 2 * BODY.radius, 4, 12),
    material,
  );
  capsule.position.y = BODY.height / 2;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.2), material);
  nose.position.set(0, 1.5, -BODY.radius);
  group.add(capsule, nose);
  for (const mesh of [capsule, nose]) mesh.castShadow = true;
  return group;
}

/** Where a moving solid's body stood as authored: its node follows the body's moves from there. */
function authoredBody(solid: Solid): THREE.Matrix4 {
  if (solid.kind === 'hull') return new THREE.Matrix4();
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...solid.center),
    new THREE.Quaternion(...solid.turn),
    new THREE.Vector3(1, 1, 1),
  );
}

export async function createWalkView(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  tier: TierSettings,
  space: WalkSpace,
): Promise<WalkView> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: tier.antialias });
  await renderer.init();
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DAYLIGHT);
  const skyLight = new THREE.HemisphereLight(0xffffff, 0x4a5240, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(6, 12, 8);
  scene.add(skyLight, sun);
  sunShadows(renderer, sun, tier.shadowMap);
  const shadows = tier.shadowMap > 0;
  const environment = createEnvironmentView(
    scene,
    { sky: skyLight, sun },
    { physicalSky: tier.physicalSky, weatherShare: tier.weatherShare },
  );
  const terrain = createTerrainView(
    '#ffffff',
    () => {},
    (area) => foliage.changed(area),
  );
  const foliage = createFoliageView(() => {}, terrain.grid, {
    reach: tier.foliageReach,
    share: tier.foliageShare,
    shadows: tier.foliageShadows && shadows,
  });
  scene.add(terrain.root, foliage.root);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 2000);
  const builder = createBuilder();
  const character = bodyMesh();
  scene.add(character);
  const marker = createTapMarker(scene);

  let hidden: ReadonlySet<string> = new Set();
  /** Each moving solid's node, its world matrix when built, and its body's authored place inverted. */
  const movers = new Map<string, { node: THREE.Object3D; meshAt: THREE.Matrix4; bodyFrom: THREE.Matrix4 }>();
  const moving = space.parts.solids.filter((s) => s.moves);
  // Hoisted: a model whose file finishes decoding builds what is drawn again.
  const models = createViewModels(
    renderer,
    () => {
      near.rebuild();
      showFar();
      foliage.models(draw());
    },
    (message) => console.warn(message),
  );
  const draw = () => models.use(space.models);
  const near = createNearObjects(
    space.space,
    space.prefabs,
    builder,
    draw,
    (node) => {
      node.updateMatrixWorld(true);
      const id = String(node.userData.objectId);
      for (const solid of moving) {
        if (topOf(solid.path) !== id) continue;
        const at = nodeAt(near.root, solid.path);
        if (at)
          movers.set(solid.path, { node: at, meshAt: at.matrixWorld.clone(), bodyFrom: authoredBody(solid).invert() });
      }
      for (const path of hidden) {
        const taken = topOf(path) === id ? nodeAt(near.root, path) : undefined;
        if (taken) taken.visible = false;
      }
    },
    shadows,
    (key, passed) => space.npcs(key, passed)?.figure ?? null,
  );
  const npcs = createNpcView(space, () => near.root);
  const farOnes = createFarModels(space.space, space.prefabs, builder, draw, shadows);
  let lastFar: { placements: readonly Placement[]; water: readonly string[] } = { placements: [], water: [] };
  const showFar = () => farOnes.show(lastFar.placements, lastFar.water);
  scene.add(near.root, farOnes.root);

  terrain.show(space.space.terrain ?? null, space.terrain);
  foliage.show(space.foliage);
  foliage.models(draw());
  environment.show(space.environment ? environmentLook(space.environment) : null);
  closeFog(scene, tier.viewDistance);
  if (shadows) fitShadowsTo(sun, terrain.grid(), undefined);

  let size = { w: 1, h: 1 };
  const resize = () => {
    size = { w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) };
    renderer.setPixelRatio(pixelRatioOf(tier, window.devicePixelRatio));
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  };
  const watcher = new ResizeObserver(resize);
  watcher.observe(host);
  resize();

  const body = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const parent = new THREE.Matrix4();
  let frames = 0;

  /** A moving solid's node where its body is: the body's move from where it was authored, laid on the node as built. */
  const follow = (path: string, at: Vec3, turn: Quat) => {
    const mover = movers.get(path);
    if (!mover?.node.parent) return;
    body.compose(new THREE.Vector3(...at), new THREE.Quaternion(...turn), new THREE.Vector3(1, 1, 1));
    world.multiplyMatrices(body, mover.bodyFrom).multiply(mover.meshAt);
    parent.copy(mover.node.parent.matrixWorld).invert();
    world.premultiply(parent).decompose(mover.node.position, mover.node.quaternion, mover.node.scale);
  };
  const hideIn = () => {
    for (const path of hidden) {
      const node = nodeAt(near.root, path);
      if (node) node.visible = false;
    }
  };

  return {
    canvas,
    frame(shot, feet, yaw, drawBody, moved) {
      if (near.build(false) && shadows) fitShadowsTo(sun, terrain.grid(), near.root);
      camera.position.set(...shot.at);
      camera.lookAt(...shot.target);
      camera.updateMatrixWorld();
      character.visible = drawBody;
      character.position.set(...feet);
      character.rotation.set(0, (yaw * Math.PI) / 180, 0);
      for (const m of moved) follow(m.path, m.at, m.turn);
      npcs.apply(performance.now());
      const eye: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      terrain.levels(eye);
      foliage.levels(eye);
      for (const lod of near.lods()) {
        lod.updateWorldMatrix(true, false);
        lod.update(camera);
      }
      environment.frame(camera, shot.target, performance.now());
      renderer.render(scene, camera);
      frames++;
    },
    perf(intervals) {
      return perfSummary({
        tier,
        backend,
        renderer,
        sun,
        objects: near.root,
        ground: terrain.chunks,
        foliageShadows: foliage.summary().some((f) => f.shadows),
        sky: environment.summary()?.sky ?? null,
        frames: frameStats(intervals),
      });
    },
    hide(taken) {
      hidden = taken;
      hideIn();
    },
    hidden() {
      return [...hidden].filter((path) => nodeAt(near.root, path)?.visible === false).sort();
    },
    near(ids, order) {
      near.want(ids, order);
      for (const path of [...movers.keys()]) if (!ids.has(topOf(path))) movers.delete(path);
    },
    settle() {
      if (near.build(true) && shadows) fitShadowsTo(sun, terrain.grid(), near.root);
    },
    far(placements, water) {
      lastFar = { placements, water };
      showFar();
    },
    npcs,
    ray: (x, y) => rayFrom(camera, x, y, size.w, size.h),
    screenOf: (p) => screenFrom(camera, p, size.w, size.h),
    marker,
    streaming: () => ({
      built: near.built(),
      waiting: near.waiting,
      slowest: near.slowest,
      far: farOnes.summary(),
    }),
    get frames() {
      return frames;
    },
    dispose() {
      watcher.disconnect();
      near.dispose();
      farOnes.dispose();
      builder.dispose();
      terrain.dispose();
      foliage.dispose();
      environment.dispose();
      models.dispose();
      renderer.dispose();
    },
  };
}
