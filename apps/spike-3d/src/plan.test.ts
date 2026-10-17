import { describe, expect, it } from 'vitest';
import { nextStep, planRun, type Run, readRun, type Step, type StepResult, withResult } from './plan.ts';

const names = (steps: readonly Step[]) => steps.map((s) => `${s.tier} on ${s.backend}`);
const resultOf = (step: Step): StepResult => ({
  ...step,
  stats: null,
  ran: step.backend,
  canvas: '1×1',
  physics: null,
});

describe('planRun', () => {
  it('measures WebGPU first when there is one, then WebGL2, low to high', () => {
    expect(names(planRun(true).steps)).toEqual([
      'low on webgpu',
      'medium on webgpu',
      'high on webgpu',
      'low on webgl',
      'medium on webgl',
      'high on webgl',
    ]);
    expect(names(planRun(false).steps)).toEqual(['low on webgl', 'medium on webgl', 'high on webgl']);
    expect(planRun(false)).toMatchObject({ results: [], warmup: 3, measure: 10 });
  });
});

describe('withResult', () => {
  it('takes results in the plan’s order, then nothing more', () => {
    let run: Run = planRun(false, 1, 2);
    for (const step of planRun(false).steps) {
      expect(nextStep(run)).toEqual(step);
      run = withResult(run, resultOf(step));
    }
    expect(nextStep(run)).toBeNull();
    expect(run.results).toHaveLength(3);
    expect(() => withResult(run, resultOf({ tier: 'low', backend: 'webgl' }))).toThrow('no more steps');
  });

  it('refuses a result for another step', () => {
    const run = planRun(true);
    expect(() => withResult(run, resultOf({ tier: 'medium', backend: 'webgpu' }))).toThrow('expected low on webgpu');
    expect(() => withResult(run, resultOf({ tier: 'low', backend: 'webgl' }))).toThrow('expected low on webgpu');
  });
});

describe('readRun', () => {
  it('reads back what was written, and nothing else', () => {
    const run = withResult(planRun(false), resultOf({ tier: 'low', backend: 'webgl' }));
    expect(readRun(JSON.stringify(run))).toEqual(run);
    expect(readRun(null)).toBeNull();
    expect(readRun('{not json')).toBeNull();
    expect(readRun('null')).toBeNull();
    expect(readRun(JSON.stringify({ ...run, warmup: '3' }))).toBeNull();
    expect(readRun(JSON.stringify({ ...run, steps: run.steps.slice(0, 0) }))).toBeNull();
  });
});
