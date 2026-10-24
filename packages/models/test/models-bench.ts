/**
 * Measures a model's work in Node (M5.5, D67): a model packed as import packs it, from plain
 * floats and from Draco; a LOD level cut by the simplifier; and each collider fitted. On the
 * test's hills (2,048 triangles) and on a grid four times their size (8,192). Medians of N: the
 * instrument behind the "Model packing" and "Model sizes" readings in ROADMAP.md, the sizes as
 * they are and gzipped at level 9. The browser's own times come from the console lines the import
 * writes.
 *
 *   node packages/models/test/models-bench.ts
 */
import { gzipSync } from 'node:zlib';
import { fitBox, fitCapsule, fitSphere, modelPositions } from '../src/colliders.ts';
import { fitHull } from '../src/hull.ts';
import { floatPositions, lodReady, simplifyIndices } from '../src/lod.ts';
import { packModel, readModel } from '../src/pack.ts';
import { dracoDecoder, glbOf, gridArrays, gridModel } from './shapes.ts';

const N = 15;

async function median(run: () => Promise<unknown> | unknown, n = N): Promise<number> {
  const times: number[] = [];
  for (let k = 0; k < n; k++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(n / 2)] as number;
}

const ms = (n: number) => `${n.toFixed(2)} ms`;
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const sizes = (bytes: Uint8Array) =>
  `${kb(bytes.byteLength)} (${kb(gzipSync(bytes, { level: 9 }).byteLength)} gzipped)`;
const decoders = { draco: await dracoDecoder() };
await lodReady;

for (const [label, n] of [
  ['hills, 33 a side, 2,048 triangles', 33],
  ['grid, 65 a side, 8,192 triangles', 65],
] as const) {
  // The hills' own grid is 33 a side; a bigger one is the same shape with more vertices.
  const doc = gridModel();
  if (n !== 33) {
    const { positions, normals, uvs, indices } = gridArrays(n);
    const [primitive] = doc.getRoot().listMeshes()[0]?.listPrimitives() ?? [];
    primitive?.getAttribute('POSITION')?.setArray(positions);
    primitive?.getAttribute('NORMAL')?.setArray(normals);
    primitive?.getAttribute('TEXCOORD_0')?.setArray(uvs);
    primitive?.getIndices()?.setArray(indices);
  }
  const plain = await glbOf(doc);
  const draco = await glbOf(n === 33 ? gridModel() : doc, 'draco');
  const packed = await packModel({ name: 'm.glb', bytes: plain }, [], decoders);
  const fromDraco = await packModel({ name: 'm.glb', bytes: draco }, [], decoders);
  console.log(`${label}: plain ${sizes(plain)}, Draco ${sizes(draco)}`);
  console.log(`  packed ${sizes(packed)}, packed from Draco ${sizes(fromDraco)}`);
  for (const [from, bytes] of [
    ['plain', plain],
    ['Draco', draco],
  ] as const) {
    const time = await median(() => packModel({ name: 'm.glb', bytes }, [], decoders));
    console.log(`  packed from ${from}: ${ms(time)}`);
  }
  const { positions, indices } = gridArrays(n);
  for (const ratio of [0.5, 0.1]) {
    const time = await median(() => simplifyIndices(indices, floatPositions(positions, false), 3, ratio));
    console.log(`  a level at ${ratio}: ${ms(time)}`);
  }
  const points = modelPositions(await readModel({ name: 'm.glb', bytes: packed }, [], decoders));
  for (const [shape, fit] of [
    ['box', fitBox],
    ['sphere', fitSphere],
    ['capsule', fitCapsule],
    ['hull', fitHull],
  ] as const) {
    console.log(`  ${shape} fitted: ${ms(await median(() => fit(points)))}`);
  }
}
