/**
 * The walk's view (M5.8, D70, docs/specs/movement.md#the-stage): a space drawn as the Scene panel
 * draws it (build.ts, the terrain, environment, foliage and models views), at a quality tier, with
 * no grid, gizmo or labels, from wherever the stage's camera stands. The stage asks for every frame.
 */

import * as THREE from 'three/webgpu';
import { lookOf as environmentLook } from '../environment/look.ts';
import { frameStats } from '../perf/frames.ts';
import { pixelRatioOf, type TierSettings } from '../perf/tiers.ts';
import { createBuilder } from '../spaces/build.ts';
import { createEnvironmentView } from '../spaces/environmentView.ts';
import { createFoliageView } from '../spaces/foliageView.ts';
import { lodsOf } from '../spaces/meshes.ts';
import { perfSummary } from '../spaces/perfSummary.ts';
import { castShadows, fitShadowsTo, sunShadows } from '../spaces/shadows.ts';
import { createTerrainView } from '../spaces/terrainView.ts';
import type { Quat, Vec3 } from '../spaces/vec.ts';
import { createViewModels } from '../spaces/viewModels.ts';
import type { PerfSummary } from '../spaces/viewportHook.ts';
import type { Shot } from './cameras.ts';
import { BODY } from './physics.ts';
import type { WalkSpace } from './world.ts';

/** A game's sky when its space names no environment: daylight, not the editor's dark. */
const DAYLIGHT = '#a9c6db';
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
  readonly frames: number;
  dispose(): void;
}

/** The object at a path of ids, as the builder tags them: "placement/inner". */
function nodeAt(root: THREE.Object3D, path: string): THREE.Object3D | undefined {
  const [first, ...rest] = path.split('/');
  let node = root.children.find((c) => c.userData.objectId === first);
  for (const id of rest) node = node?.children.find((c) => c.userData.innerId === id);
  return node;
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
    shadows: tier.foliageShadows && tier.shadowMap > 0,
  });
  scene.add(terrain.root, foliage.root);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 2000);
  const builder = createBuilder();
  const character = bodyMesh();
  scene.add(character);

  let built: ReturnType<typeof builder.build> | null = null;
  let hidden: ReadonlySet<string> = new Set();
  const hideIn = (root: THREE.Object3D) => {
    for (const path of hidden) {
      const node = nodeAt(root, path);
      if (node) node.visible = false;
    }
  };
  let lods: THREE.LOD[] = [];
  /** Each moving solid's node, and its world matrix and its body's when the space was built. */
  let movers = new Map<string, { node: THREE.Object3D; meshAt: THREE.Matrix4; bodyAt: THREE.Matrix4 | null }>();
  // rebuild is hoisted: a model whose file finishes decoding builds the space again.
  const models = createViewModels(
    renderer,
    () => rebuild(),
    (message) => console.warn(message),
  );

  function rebuild() {
    if (built) {
      scene.remove(built.root);
      built.dispose();
    }
    const draw = models.use(space.models);
    built = builder.build(space.space, space.prefabs, undefined, draw, true);
    if (tier.shadowMap > 0) castShadows(built.root);
    lods = lodsOf(built.root);
    foliage.models(draw);
    hideIn(built.root);
    scene.add(built.root);
    built.root.updateMatrixWorld(true);
    const moving = space.parts.solids.filter((s) => s.moves).map((s) => s.path);
    movers = new Map(
      moving.flatMap((path) => {
        const node = built ? nodeAt(built.root, path) : undefined;
        return node ? [[path, { node, meshAt: node.matrixWorld.clone(), bodyAt: null }] as const] : [];
      }),
    );
    if (tier.shadowMap > 0) fitShadowsTo(sun, terrain.grid(), built.root);
  }

  terrain.show(space.space.terrain ?? null, space.terrain);
  foliage.show(space.foliage);
  environment.show(space.environment ? environmentLook(space.environment) : null);
  rebuild();

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

  /** A moving solid's node where its body is: the body's move since the build, laid on the node's matrix then. */
  const follow = (path: string, at: Vec3, turn: Quat) => {
    const mover = movers.get(path);
    if (!mover) return;
    body.compose(new THREE.Vector3(...at), new THREE.Quaternion(...turn), new THREE.Vector3(1, 1, 1));
    mover.bodyAt ??= body.clone().invert();
    world.multiplyMatrices(body, mover.bodyAt).multiply(mover.meshAt);
    const up = mover.node.parent;
    parent.copy(up ? up.matrixWorld : new THREE.Matrix4()).invert();
    world.premultiply(parent).decompose(mover.node.position, mover.node.quaternion, mover.node.scale);
  };

  return {
    canvas,
    frame(shot, feet, yaw, drawBody, moving) {
      camera.position.set(...shot.at);
      camera.lookAt(...shot.target);
      camera.updateMatrixWorld();
      character.visible = drawBody;
      character.position.set(...feet);
      character.rotation.set(0, (yaw * Math.PI) / 180, 0);
      for (const m of moving) follow(m.path, m.at, m.turn);
      const eye: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      terrain.levels(eye);
      foliage.levels(eye);
      for (const lod of lods) {
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
        objects: built?.root,
        ground: terrain.chunks,
        foliageShadows: foliage.summary().some((f) => f.shadows),
        sky: environment.summary()?.sky ?? null,
        frames: frameStats(intervals),
      });
    },
    hide(taken) {
      hidden = taken;
      if (built) hideIn(built.root);
    },
    hidden() {
      const root = built?.root;
      return root ? [...hidden].filter((path) => nodeAt(root, path)?.visible === false).sort() : [];
    },
    get frames() {
      return frames;
    },
    dispose() {
      watcher.disconnect();
      built?.dispose();
      builder.dispose();
      terrain.dispose();
      foliage.dispose();
      environment.dispose();
      models.dispose();
      renderer.dispose();
    },
  };
}
