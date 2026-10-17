/**
 * Frame statistics from the times between animation frames. FPS alone hides stutter, so a
 * measurement also gives the median frame, the 95th percentile and the worst one.
 */
export interface FrameStats {
  readonly frames: number;
  readonly seconds: number;
  readonly fps: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly worstMs: number;
}

/** `deltas` are milliseconds between consecutive frames. Nearest rank, so each figure is a frame that happened. */
export function frameStats(deltas: readonly number[]): FrameStats | null {
  if (deltas.length === 0) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const total = deltas.reduce((sum, d) => sum + d, 0);
  const rank = (percent: number) => sorted[Math.max(1, Math.ceil((percent * sorted.length) / 100)) - 1] as number;
  return {
    frames: deltas.length,
    seconds: total / 1000,
    fps: total > 0 ? (deltas.length * 1000) / total : 0,
    medianMs: rank(50),
    p95Ms: rank(95),
    worstMs: sorted[sorted.length - 1] as number,
  };
}

/** The deltas of the frames that ended within the last `windowMs`, for the live overlay. */
export class FrameWindow {
  private readonly times: number[] = [];
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  add(now: number): void {
    this.times.push(now);
    while (this.times.length > 2 && now - (this.times[0] as number) > this.windowMs) this.times.shift();
  }

  deltas(): number[] {
    return this.times.slice(1).map((t, i) => t - (this.times[i] as number));
  }
}
