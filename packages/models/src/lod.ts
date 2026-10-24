/**
 * LOD levels (M5.5, D67, docs/specs/models.md#placing-and-drawing): a primitive's triangles cut to
 * a ratio by meshoptimizer's simplifier, sharing its vertices. The same indices, positions and
 * ratio give the same triangles in every engine, so a level is worked out as a model is drawn and
 * never stored. Where the careful simplifier can't get within a fifth of the ratio, the sloppy one,
 * which welds vertices it needn't keep apart, finishes the job.
 */
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

export const lodReady: Promise<void> = MeshoptSimplifier.ready;

/** The triangles kept of `indices` at `ratio`, positions read `stride` floats apart. Call after lodReady. */
export function simplifyIndices(
  indices: Uint32Array,
  positions: Float32Array,
  stride: number,
  ratio: number,
): Uint32Array {
  const target = Math.max(3, Math.floor((indices.length / 3) * ratio) * 3);
  if (target >= indices.length) return indices.slice();
  const [careful] = MeshoptSimplifier.simplify(indices, positions, stride, target, 1);
  if (careful.length <= target * 1.2) return careful;
  const [sloppy] = MeshoptSimplifier.simplifySloppy(indices, positions, stride, null, target, 1);
  return sloppy.length > 0 && sloppy.length < careful.length ? sloppy : careful;
}

/** Positions as floats for the simplifier: quantised ones read back to their own scale, which it measures within. */
export function floatPositions(array: ArrayLike<number>, normalized: boolean): Float32Array {
  if (array instanceof Float32Array) return array;
  const out = new Float32Array(array.length);
  const scale = normalized ? 1 / 32767 : 1;
  for (let i = 0; i < array.length; i++) out[i] = (array[i] as number) * scale;
  return out;
}
