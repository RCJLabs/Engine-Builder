/**
 * Clips made to play in place (M6.5, D77, docs/specs/animation.md#importing-a-rigged-model): the
 * character controller moves the body, so the hips' drift across the ground over a clip is taken
 * out and kept as the clip's pace, in metres a second. Only the straight line from the first key to
 * the last goes; a walk's sway from side to side and its rise and fall stay.
 */
import type { Document, Node } from '@gltf-transform/core';

export interface Clip {
  readonly name: string;
  /** Seconds, the last key's time less the first's. */
  readonly length: number;
  /** Metres a second the hips crossed before their drift was taken out; 0 for one that stays put. */
  readonly pace: number;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** Each clip's name, length and pace, the hips' drift taken out of `hips`'s translation keys. */
export function inPlace(doc: Document, hips: Node | null): Clip[] {
  return doc
    .getRoot()
    .listAnimations()
    .map((animation, n) => {
      let first = Infinity;
      let last = -Infinity;
      for (const channel of animation.listChannels()) {
        const times = channel.getSampler()?.getInput();
        if (!times || times.getCount() === 0) continue;
        first = Math.min(first, times.getScalar(0));
        last = Math.max(last, times.getScalar(times.getCount() - 1));
      }
      const length = Number.isFinite(first) ? last - first : 0;
      const name = animation.getName() || `clip-${n + 1}`;
      const channel = animation
        .listChannels()
        .find((c) => c.getTargetNode() === hips && c.getTargetPath() === 'translation');
      const sampler = channel?.getSampler();
      const times = sampler?.getInput();
      const keys = sampler?.getOutput();
      if (!sampler || !times || !keys || length <= 0) return { name, length: round(length, 4), pace: 0 };
      const cubic = sampler.getInterpolation() === 'CUBICSPLINE';
      const value = (k: number) => keys.getElement(cubic ? k * 3 + 1 : k, [] as number[]);
      const start = value(0);
      const end = value(times.getCount() - 1);
      const span = times.getScalar(times.getCount() - 1) - times.getScalar(0);
      const dx = ((end[0] as number) - (start[0] as number)) / (span || 1);
      const dz = ((end[2] as number) - (start[2] as number)) / (span || 1);
      for (let k = 0; k < keys.getCount(); k++) {
        const at = keys.getElement(k, [] as number[]);
        const key = cubic ? Math.floor(k / 3) : k;
        if (cubic && k % 3 !== 1) {
          // A tangent is a rate: the drift's rate comes off it.
          keys.setElement(k, [(at[0] as number) - dx, at[1] as number, (at[2] as number) - dz]);
          continue;
        }
        const t = times.getScalar(key) - times.getScalar(0);
        keys.setElement(k, [(at[0] as number) - dx * t, at[1] as number, (at[2] as number) - dz * t]);
      }
      return { name, length: round(length, 4), pace: round(Math.hypot(dx, dz), 3) };
    });
}
