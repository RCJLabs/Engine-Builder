/**
 * The animator preview's view (M6.5, D77), a chunk of its own: the starter character on a disc of
 * ground, its animator stepped each frame on the facts the form sets, as the walk steps it, and
 * the clips it names from the starter character or from the project's own models, decoded from
 * their files here. A swing or a draw chosen runs its phase once over half a second, so a fit
 * state can be seen through. window.__ebAnimPreview reads back what the mixer plays (e2e).
 */
import type { AnimatorRecord, ModelClip } from '@eb/schema';
import { ANIMATOR_DATA, schemaIssues } from '@eb/schema';
import { useEffect, useRef, useState } from 'preact/hooks';
import * as THREE from 'three/webgpu';
import {
  type AnimFacts,
  type AnimRun,
  type ClipInfo,
  compileAnimator,
  type Machine,
  type Played,
  playedOf,
  startRun,
  stepAnimator,
} from '../anim/animator.ts';
import { CHARACTER, CHARACTER_MODEL, createCharacters, STOCK_ANIMATOR } from '../anim/character.ts';
import { loadCharacter } from '../anim/characterLoad.ts';
import { type ClipSource, createAnimated, type Playing } from '../anim/mixer.ts';
import type { OpenProject } from '../projects/opened.ts';
import { FIGURE } from '../spaces/figureLook.ts';
import { decodeClips, type ModelClips, modelsNamed } from './previewClips.ts';

/** What the preview plays, as the e2e reads it. */
export interface PreviewSeen {
  readonly base: readonly Played[];
  readonly upper: readonly Played[];
  readonly playing: readonly Playing[];
  readonly rightHand: readonly [number, number, number];
}

declare global {
  interface Window {
    __ebAnimPreview?: () => PreviewSeen | null;
  }
}

const PHASE_S = 0.5;
const LOOK = { height: FIGURE.height, clothes: FIGURE.clothes, trim: FIGURE.trim, skin: FIGURE.skin };

/** The record as an animator, or null while it doesn't read as one. */
const asAnimator = (value: unknown): AnimatorRecord | null =>
  schemaIssues(ANIMATOR_DATA.recordType.schema, value).length === 0 ? (value as AnimatorRecord) : null;

interface Props {
  readonly project: OpenProject;
  readonly value: unknown;
  readonly facts: AnimFacts;
}

export function AnimatorView({ project, value, facts }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ value, facts, project });
  live.current = { value, facts, project };
  const [said, setSaid] = useState<{ base: string; upper: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const record = asAnimator(value);
  useEffect(() => {
    const at = canvas.current;
    if (!at) return;
    let stop = false;
    let dispose = () => {};
    start(at, live, setSaid).then(
      (done) => {
        if (stop) done();
        else dispose = done;
      },
      (error: unknown) => setFailed(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      stop = true;
      dispose();
    };
  }, []);
  return (
    <div class="anim-view">
      <canvas ref={canvas} class="anim-canvas" aria-label="The starter character playing this animator" />
      {failed ? <p class="field-problem">The preview can’t draw: {failed}</p> : null}
      {record ? null : <p class="muted">Its problems fixed, it plays here.</p>}
      <p class="anim-status" data-base={said?.base ?? ''} data-upper={said?.upper ?? ''}>
        Whole body: {said?.base || '…'} · Upper body: {said?.upper || 'none'}
      </p>
    </div>
  );
}

const playedText = (played: readonly Played[]) => {
  const now = played.at(-1);
  if (!now) return '';
  return now.clip === null ? now.state : `${now.state}, playing ${now.clip} from ${now.model}`;
};

type Live = { current: { value: unknown; facts: AnimFacts; project: OpenProject } };

async function start(canvas: HTMLCanvasElement, live: Live, say: (s: { base: string; upper: string }) => void) {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfd8dc');
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(3, 6, -4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5240, 1.6), sun);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#7d8a6a' }),
  );
  scene.add(ground);
  // From the front and a little to its left, as it faces −z.
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  camera.position.set(1.6, 1.5, -3.6);
  camera.lookAt(0, 0.9, 0);

  const made = await loadCharacter();
  const figure = createCharacters().character(made, LOOK);
  scene.add(figure);
  const root = figure.children[0] as THREE.Object3D;
  const models = new Map<string, ModelClips | null>();
  const clipSource: ClipSource = (model, clip) => {
    if (model === CHARACTER) {
      const found = made.clips.get(clip);
      return found ? { clip: found, hips: made.hips } : undefined;
    }
    const found = models.get(model);
    const one = found?.clips.get(clip);
    return found && one ? { clip: one, hips: found.hips } : undefined;
  };
  const clipInfo = (model: string, clip: string): ClipInfo | undefined => {
    const record =
      model === CHARACTER
        ? CHARACTER_MODEL
        : (live.current.project.index?.records.get(`model:${model}`)?.value as { clips?: ModelClip[] } | undefined);
    return record?.clips?.find((c) => c.name === clip);
  };
  let animated = createAnimated(root, made.hips, clipSource);
  let machine: Machine = compileAnimator(STOCK_ANIMATOR);
  let run: AnimRun = startRun(machine);
  let shown = '';
  let phaseOf = '';
  let phaseAt = 0;
  let last = performance.now();
  let lastSaid = 0;

  const fit = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resized = new ResizeObserver(fit);
  resized.observe(canvas);
  fit();

  const frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const { value, facts, project } = live.current;
    const record = asAnimator(value);
    const key = record ? JSON.stringify(record) : shown;
    if (record && key !== shown) {
      shown = key;
      machine = compileAnimator(record);
      run = startRun(machine);
      for (const id of modelsNamed(record)) {
        if (id === CHARACTER || models.has(id)) continue;
        models.set(id, null);
        void decodeClips(project, id).then((clips) => {
          models.set(id, clips);
          // Actions are kept by clip: a body made again binds what has just been decoded.
          animated.dispose();
          animated = createAnimated(root, made.hips, clipSource);
        });
      }
    }
    const fighting = `${facts.swing}/${facts.draw}`;
    if (fighting !== phaseOf) {
      phaseOf = fighting;
      phaseAt = 0;
    }
    phaseAt = Math.min(PHASE_S, phaseAt + dt);
    const phased =
      facts.swing !== 'none' || facts.draw !== 'none' ? { ...facts, phase: { length: PHASE_S, at: phaseAt } } : facts;
    run = stepAnimator(machine, run, phased, dt, clipInfo);
    const base = playedOf(machine, 'base', run);
    const upper = playedOf(machine, 'upper', run);
    animated.lay(base, upper);
    renderer.render(scene, camera);
    if (now - lastSaid > 100) {
      lastSaid = now;
      say({ base: playedText(base), upper: playedText(upper) });
    }
    window.__ebAnimPreview = () => {
      const hand = root.getObjectByName('rightHand')?.getWorldPosition(new THREE.Vector3());
      return { base, upper, playing: animated.playing(), rightHand: hand ? [hand.x, hand.y, hand.z] : [0, 0, 0] };
    };
  };
  renderer.setAnimationLoop(frame);

  return () => {
    renderer.setAnimationLoop(null);
    resized.disconnect();
    animated.dispose();
    renderer.dispose();
    delete window.__ebAnimPreview;
  };
}
