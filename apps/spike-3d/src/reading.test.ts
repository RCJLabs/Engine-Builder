import { describe, expect, it } from 'vitest';
import { frameStats } from './frames.ts';
import { planRun, type Run, withResult } from './plan.ts';
import { formatReading, statsText } from './reading.ts';

const device = { userAgent: 'TestPhone/1.0', screen: '412×915', devicePixelRatio: 2.625, date: '2026-10-17' };

function partRun(): Run {
  let run = planRun(true, 3, 10);
  run = withResult(run, {
    tier: 'low',
    backend: 'webgpu',
    stats: frameStats([16, 17, 16, 50]),
    ran: 'webgpu',
    canvas: '412×915',
    physics: { importMs: 412.25, initMs: 88.5 },
  });
  run = withResult(run, {
    tier: 'medium',
    backend: 'webgpu',
    stats: null,
    ran: 'webgl',
    canvas: '618×1372',
    physics: null,
  });
  return run;
}

describe('formatReading', () => {
  it('gives the device, the protocol, a line a step, what was skipped and Rapier’s times', () => {
    expect(formatReading(device, partRun()).split('\n')).toEqual([
      '3D spike reading, 2026-10-17',
      'Device: TestPhone/1.0',
      'Screen: 412×915 CSS px at 2.625x',
      'Protocol: 3 s to settle, 10 s measured, each step on a fresh page load',
      'low on webgpu at 412×915: 40.4 fps (median 16.0 ms, p95 50.0 ms, worst 50.0 ms, N=4 frames over 0.1 s)',
      'medium on webgpu asked, webgl ran at 618×1372: no frames drawn',
      '4 steps not run',
      'Rapier, ms to load + start, by page load: 412.3 + 88.5, failed',
    ]);
  });

  it('counts one skipped step as one', () => {
    let run = planRun(false);
    for (const step of run.steps.slice(0, 2)) {
      run = withResult(run, { ...step, stats: null, ran: step.backend, canvas: '1×1', physics: null });
    }
    expect(formatReading(device, run)).toContain('\n1 step not run\n');
  });
});

describe('statsText', () => {
  it('says when no frame was drawn', () => {
    expect(statsText(null)).toBe('no frames drawn');
  });
});
