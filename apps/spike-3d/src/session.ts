/**
 * The page's side of the measuring plan: the run kept in sessionStorage between page loads, and
 * the URLs that move it on. sessionStorage belongs to the tab, so closing the tab drops the run.
 */
import { nextStep, planRun, type Run, readRun, type Step } from './plan.ts';

const KEY = 'eb-spike-3d-run';

export function savedRun(): Run | null {
  try {
    return readRun(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveRun(run: Run | null): void {
  try {
    if (run) sessionStorage.setItem(KEY, JSON.stringify(run));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage turned off: the run can't continue past this page, and the overlay says so.
  }
}

/** The page that runs `step`. */
export const stepUrl = (step: Step) => `?tier=${step.tier}&backend=${step.backend}&measuring=1`;

/** The page that shows a finished run's reading. */
export const doneUrl = '?done=1';

/** Starts a run: settle and measure times come from the page's own query, for quick runs in tests. */
export function beginRun(hasWebGpu: boolean, query: URLSearchParams): string {
  const seconds = (name: string, fallback: number) => {
    const value = Number(query.get(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const run = planRun(hasWebGpu, seconds('warmup', 3), seconds('measure', 10));
  saveRun(run);
  return stepUrl(nextStep(run) as Step);
}
