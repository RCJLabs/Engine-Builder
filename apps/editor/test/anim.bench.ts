/**
 * Measures the walk's animation (M6.5, D77) in Node: one frame of walk/anims.ts's frame() for the
 * square's thirteen bodies (the player and twelve villagers), each the starter character on the
 * stock animator, half walking and half idle, all within 30 m so each steps every frame; the same
 * thirteen at 45 m, stepped every other frame; and one body alone. Each frame steps the animator,
 * lays its clips on the mixer and updates the skeleton; drawing is the browser's and isn't here.
 * Medians of N: the instrument behind the "animation" readings in ROADMAP.md. Run by Vitest, whose
 * Vite reads the character's JSON and its GLB's URL as the editor's build does:
 *
 *   pnpm exec vitest run --config apps/editor/test/bench.config.ts --disable-console-intercept
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as THREE from 'three/webgpu';
import { it } from 'vitest';
import { type AnimFacts, STILL } from '../src/anim/animator.ts';
import { createCharacters } from '../src/anim/character.ts';
import { loadCharacter } from '../src/anim/characterLoad.ts';
import { FIGURE } from '../src/spaces/figureLook.ts';
import type { Vec3 } from '../src/spaces/vec.ts';
import { type AnimBody, createAnims, NEAR_M } from '../src/walk/anims.ts';

const GLB = resolve(import.meta.dirname, '../../../starter-character/assets/starter-character/starter-character.glb');
const bytes = readFileSync(GLB);
const made = await loadCharacter(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const characters = createCharacters();
const LOOK = { height: FIGURE.height, clothes: FIGURE.clothes, trim: FIGURE.trim, skin: FIGURE.skin };
const EYE: Vec3 = [0, 1.6, 0];
const WALKING: AnimFacts = { ...STILL, speed: 1.4 };

/** `n` bodies on a ring `far` metres from the eye, every other one walking. */
function bodies(n: number, far: number): AnimBody[] {
  return Array.from({ length: n }, (_, i) => {
    const node: THREE.Object3D = characters.character(made, LOOK);
    const turn = (2 * Math.PI * i) / n;
    node.position.set(far * Math.cos(turn), 0, far * Math.sin(turn));
    node.updateMatrixWorld(true);
    return { key: `body-${i}`, node, animator: null, facts: i % 2 === 0 ? WALKING : STILL };
  });
}

const DT = 1 / 60;
const N = 301;

function median(run: () => void): number {
  const times: number[] = [];
  for (let k = 0; k < N; k++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(N / 2)] as number;
}

it('times a frame of the walk’s animation', () => {
  for (const [label, n, far] of [
    ['the square’s thirteen within 30 m', 13, 10],
    ['the thirteen at 45 m, every other frame', 13, 45],
    ['one body', 1, 10],
  ] as const) {
    const anims = createAnims(
      () => undefined,
      () => null,
      NEAR_M,
    );
    const all = bodies(n, far);
    // Warm up, so the frames timed are the walk's steady ones and not the first binds.
    for (let k = 0; k < 120; k++) anims.frame(DT, EYE, all);
    console.log(`${label}: ${median(() => anims.frame(DT, EYE, all)).toFixed(3)} ms a frame (N ${N})`);
  }
});
