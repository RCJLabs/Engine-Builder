/**
 * The measuring plan behind "Measure all tiers": every tier on every backend the device has,
 * each on a fresh page load, so no run inherits another's GPU state or heat from a page that
 * kept running. Pure: the page keeps the run in sessionStorage and asks what comes next.
 */
import type { FrameStats } from './frames.ts';
import { TIER_NAMES, type TierName } from './tiers.ts';

export type Backend = 'webgpu' | 'webgl';

export interface Step {
  readonly tier: TierName;
  readonly backend: Backend;
}

export interface StepResult extends Step {
  /** Null when not one frame was drawn in the time measured. */
  readonly stats: FrameStats | null;
  /** The backend the renderer ended up on, which can differ from the one asked for. */
  readonly ran: string;
  /** Device pixels drawn, as width×height. */
  readonly canvas: string;
  /** Rapier's load and start on this page load, or null when it failed. Only the first can be from a cold cache. */
  readonly physics: { readonly importMs: number; readonly initMs: number } | null;
}

export interface Run {
  readonly steps: readonly Step[];
  readonly results: readonly StepResult[];
  /** Seconds to settle before measuring, and to measure. */
  readonly warmup: number;
  readonly measure: number;
}

/** WebGPU first when the device has it, then WebGL2, low to high within each. */
export function planRun(hasWebGpu: boolean, warmup = 3, measure = 10): Run {
  const backends: Backend[] = hasWebGpu ? ['webgpu', 'webgl'] : ['webgl'];
  const steps = backends.flatMap((backend) => TIER_NAMES.map((tier) => ({ tier, backend })));
  return { steps, results: [], warmup, measure };
}

/** The step to run next, or null when every step has a result. */
export const nextStep = (run: Run): Step | null => run.steps[run.results.length] ?? null;

export function withResult(run: Run, result: StepResult): Run {
  const expected = nextStep(run);
  if (!expected || expected.tier !== result.tier || expected.backend !== result.backend) {
    throw new Error(`withResult(): expected ${expected ? `${expected.tier} on ${expected.backend}` : 'no more steps'}`);
  }
  return { ...run, results: [...run.results, result] };
}

/** A run read back from storage, or null when it is missing or not one this page wrote. */
export function readRun(text: string | null): Run | null {
  if (text === null) return null;
  try {
    const run = JSON.parse(text) as Run;
    const ok =
      Array.isArray(run.steps) &&
      Array.isArray(run.results) &&
      run.results.length <= run.steps.length &&
      typeof run.warmup === 'number' &&
      typeof run.measure === 'number';
    return ok ? run : null;
  } catch {
    return null;
  }
}
