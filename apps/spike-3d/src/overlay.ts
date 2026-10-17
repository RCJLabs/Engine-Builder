/**
 * The overlay: live figures, links to each tier, the button that measures them all, and the
 * reading when a run is done. Plain DOM, since the page has nothing else to render.
 */
import type { FrameStats } from './frames.ts';
import { TIER_NAMES, type TierName } from './tiers.ts';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.textContent = text;
  if (className) made.className = className;
  return made;
}

export interface Overlay {
  setBackend(text: string): void;
  setFrames(stats: FrameStats | null, counts: { calls: number; triangles: number }, canvas: string): void;
  setPhysics(text: string): void;
  setStatus(text: string): void;
  showReading(text: string): void;
  onMeasure(handler: () => void): void;
}

export function createOverlay(root: HTMLElement, current: TierName, query: string): Overlay {
  const hud = element('section', '', 'hud');
  hud.setAttribute('aria-label', 'Measurements');
  const heading = element('h1', '3D spike');
  const line = (stat: string) => {
    const p = element('p', '', 'stat');
    p.dataset.stat = stat;
    return p;
  };
  const backend = line('backend');
  const frames = line('frames');
  const physics = line('physics');
  const status = line('status');
  physics.textContent = 'Rapier: loading…';
  const tiers = element('nav', '', 'tiers');
  tiers.setAttribute('aria-label', 'Quality tier');
  for (const name of TIER_NAMES) {
    const link = element('a', `${name[0]?.toUpperCase()}${name.slice(1)}`);
    link.href = `?tier=${name}${query}`;
    if (name === current) link.setAttribute('aria-current', 'page');
    tiers.append(link);
  }
  const measure = element('button', 'Measure all tiers', 'measure');
  measure.type = 'button';
  hud.append(heading, backend, frames, physics, status, tiers, measure);

  const result = element('section', '', 'reading');
  result.hidden = true;
  result.setAttribute('aria-label', 'Reading');
  const text = element('textarea');
  text.readOnly = true;
  text.rows = 9;
  text.setAttribute('aria-label', 'The reading, to copy');
  const copy = element('button', 'Copy reading');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    text.select();
    try {
      await navigator.clipboard.writeText(text.value);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Selected: copy it from the box';
    }
  });
  result.append(element('h2', 'Reading'), text, copy);
  root.append(hud, result);

  return {
    setBackend: (value) => {
      backend.textContent = value;
    },
    setFrames(stats, counts, canvas) {
      frames.dataset.frames = String(stats?.frames ?? 0);
      frames.textContent = stats
        ? `${stats.fps.toFixed(0)} fps · median ${stats.medianMs.toFixed(1)} ms · p95 ${stats.p95Ms.toFixed(1)} ms · ${canvas} · ${counts.calls} draws, ${Math.round(counts.triangles / 1000)}k triangles`
        : 'Waiting for frames…';
    },
    setPhysics: (value) => {
      physics.textContent = value;
    },
    setStatus: (value) => {
      status.textContent = value;
    },
    showReading(value) {
      text.value = value;
      result.hidden = false;
    },
    onMeasure: (handler) => measure.addEventListener('click', handler),
  };
}
