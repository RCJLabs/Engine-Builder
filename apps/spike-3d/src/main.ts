/**
 * The 3D spike (M1.10): one scene, drawn at a chosen quality tier, with live figures, and a run
 * that measures every tier and backend in turn for the reading ROADMAP's Readings wait on.
 */
import './style.css';
import { FrameWindow, frameStats } from './frames.ts';
import { makeHeightmap } from './heightmap.ts';
import { createOverlay, type Overlay } from './overlay.ts';
import { agrees, loadPhysics, type PhysicsReport } from './physics.ts';
import { type Backend, nextStep, withResult } from './plan.ts';
import { placeProps } from './props.ts';
import { formatReading } from './reading.ts';
import { beginRun, doneUrl, savedRun, saveRun, stepUrl } from './session.ts';
import { type Tier, tierOf } from './tiers.ts';
import { createView, type View } from './view.ts';

const SEED = 'spike-3d';
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function main(): Promise<void> {
  const query = new URLSearchParams(location.search);
  const tier = tierOf(query.get('tier'));
  const asked: Backend | 'auto' = query.get('backend') === 'webgl' ? 'webgl' : 'auto';
  const root = document.querySelector('main') as HTMLElement;
  const overlay = createOverlay(root, tier.name, asked === 'webgl' ? '&backend=webgl' : '');
  overlay.onMeasure(async () => location.assign(beginRun(await hasWebGpu(), query)));
  if (query.has('done')) showReading(overlay);

  const map = makeHeightmap(SEED);
  const placements = placeProps(map, SEED);
  let view: View;
  try {
    view = await createView(document.querySelector('canvas') as HTMLCanvasElement, { map, placements, tier }, asked);
  } catch (error) {
    overlay.setBackend(`No WebGPU or WebGL2 here: ${message(error)}`);
    return;
  }
  overlay.setBackend(`${view.backend === 'webgpu' ? 'WebGPU' : 'WebGL2'} · ${tier.name} tier`);

  const recent = new FrameWindow(2000);
  let sink: number[] | null = null;
  let last: number | null = null;
  view.start((now) => {
    if (sink && last !== null) sink.push(now - last);
    last = now;
    recent.add(now);
  });
  setInterval(() => overlay.setFrames(frameStats(recent.deltas()), view.counts(), view.canvasSize()), 500);
  const collect = (ms: number) =>
    new Promise<number[]>((resolve) => {
      const got: number[] = [];
      sink = got;
      setTimeout(() => {
        sink = null;
        resolve(got);
      }, ms);
    });

  // After the first frames, so its download and start never hold up the scene.
  const physics = await loadPhysics(map, () => performance.now()).catch((error: unknown) => {
    overlay.setPhysics(`Rapier failed: ${message(error)}`);
    return null;
  });
  if (physics) overlay.setPhysics(physicsText(physics));
  if (query.has('measuring')) await measureStep(overlay, view, tier, query.get('backend'), physics, collect);
}

/**
 * Whether a run should measure WebGPU too. The API alone isn't enough: headless Chromium and
 * blocklisted GPUs offer `navigator.gpu` with no adapter, and three then falls back to WebGL2.
 */
async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  try {
    return Boolean(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

function physicsText(p: PhysicsReport): string {
  const agreement = agrees(p)
    ? `${p.rays} rays land on the drawn ground (worst gap ${p.worstError.toExponential(1)})`
    : `rays disagree with the drawn ground: ${p.misses} of ${p.rays} hit nothing, worst gap ${p.worstError.toFixed(3)}`;
  return `Rapier: ${p.importMs.toFixed(0)} ms to load, ${p.initMs.toFixed(0)} ms to start · ${agreement}`;
}

async function measureStep(
  overlay: Overlay,
  view: View,
  tier: Tier,
  backend: string | null,
  physics: PhysicsReport | null,
  collect: (ms: number) => Promise<number[]>,
): Promise<void> {
  const run = savedRun();
  const step = run && nextStep(run);
  if (!run || !step || step.tier !== tier.name || step.backend !== backend) {
    overlay.setStatus('No run to continue here. Start one with “Measure all tiers”.');
    return;
  }
  const at = `${run.results.length + 1} of ${run.steps.length}: ${tier.name} on ${step.backend}`;
  overlay.setStatus(`Measuring ${at}, settling for ${run.warmup} s…`);
  await new Promise((resolve) => setTimeout(resolve, run.warmup * 1000));
  overlay.setStatus(`Measuring ${at} for ${run.measure} s…`);
  const deltas = await collect(run.measure * 1000);
  const timing = physics && { importMs: physics.importMs, initMs: physics.initMs };
  const result = { ...step, stats: frameStats(deltas), ran: view.backend, canvas: view.canvasSize(), physics: timing };
  const next = withResult(run, result);
  saveRun(next);
  const following = nextStep(next);
  // Replace, so the back button doesn't walk through the steps again.
  location.replace(following ? stepUrl(following) : doneUrl);
}

function showReading(overlay: Overlay): void {
  const run = savedRun();
  if (!run || run.results.length === 0) {
    overlay.setStatus('No finished run in this tab.');
    return;
  }
  const device = {
    userAgent: navigator.userAgent,
    screen: `${screen.width}×${screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
    date: new Date().toISOString().slice(0, 10),
  };
  overlay.showReading(formatReading(device, run));
  overlay.setStatus('Done. Copy the reading and send it on.');
}

void main();
