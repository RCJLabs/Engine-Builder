/**
 * The perf overlay over the 3D view's corner (M5.7, D69): the tier and why, the backend, frames
 * drawn back to back, and the last frame's draw calls and triangles, read twice a second. It
 * judges no frame rate: the targets wait for the phone's reading (D69).
 */
import { useEffect, useState } from 'preact/hooks';
import type { PerfSummary } from '../spaces/viewportHook.ts';
import { tierReason } from './state.ts';

const READ_EVERY = 500;
const thousands = (n: number) => n.toLocaleString('en');

export function PerfOverlay({ read }: { read: () => PerfSummary | null }) {
  const [now, setNow] = useState(read);
  useEffect(() => {
    setNow(read());
    const timer = window.setInterval(() => setNow(read()), READ_EVERY);
    return () => window.clearInterval(timer);
  }, [read]);
  if (!now) return null;
  const { frames } = now;
  return (
    <section class="perf-overlay" aria-label="Stats">
      <p>{tierReason.value}</p>
      <p>
        {now.backend === 'webgpu' ? 'WebGPU' : 'WebGL2'}, pixel ratio {now.pixelRatio}
      </p>
      <p>
        {frames.count > 0
          ? `${frames.fps} fps, median ${frames.median} ms, 95th percentile ${frames.p95} ms`
          : 'No frames drawn back to back yet'}
      </p>
      <p>
        {thousands(now.drawCalls)} draw calls, {thousands(now.triangles)} triangles
      </p>
    </section>
  );
}
