/**
 * The walk's hosts (M5.8, D70): every page's stage is walk.js, a classic script loaded the first
 * time a Space widget draws, so the Play panel walks what an export ships. One host a world, so the
 * Space widget keeps its stage across renders. Nothing here imports the stage: game.js stays light.
 * nav.js (M6.2) is loaded the same way, by the stage, once a space with a navmesh is walked, and
 * stage2d.js (M7.1) by the host, once a 2D space is drawn.
 */
import type { PackWorld } from '@eb/core';
import type { SpaceHost } from '@eb/ui';
import type { NavLib } from '../nav/lib.ts';
import { type LoadFlat, type LoadNav, type LoadStage, type Stage2d, type WalkStage, walkHost } from './host.ts';

const made = new WeakMap<PackWorld, SpaceHost>();

export const hostFor = (
  world: PackWorld | undefined,
  load: LoadStage,
  nav?: LoadNav,
  flat?: LoadFlat,
): SpaceHost | undefined => {
  if (!world) return undefined;
  let host = made.get(world);
  if (!host) {
    host = walkHost(world, load, nav, flat);
    made.set(world, host);
  }
  return host;
};

declare global {
  interface Window {
    /** What walk.js leaves when it runs (walk/entry.ts). */
    __ebWalkStage?: WalkStage;
    /** What nav.js leaves when it runs (nav/entry.ts). */
    __ebNav?: NavLib;
    /** What stage2d.js leaves when it runs (stage2d/entry.ts). */
    __ebStage2dStage?: Stage2d;
  }
}

const loading = new Map<string, Promise<unknown>>();

/**
 * A classic script run once, and what it leaves: from its file beside the page, or from the page's
 * own element (`#id`) in a single-file export, by a blob URL, which file:// allows.
 */
function loadScript<T>(src: string, left: () => T | undefined, words: string): Promise<T> {
  const known = loading.get(src);
  if (known) return known as Promise<T>;
  const made = new Promise<T>((resolve, reject) => {
    const script = document.createElement('script');
    let blob: string | null = null;
    if (src.startsWith('#')) {
      const text = document.getElementById(src.slice(1))?.textContent ?? '';
      blob = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      script.src = blob;
    } else script.src = src;
    script.onload = () => {
      if (blob) URL.revokeObjectURL(blob);
      const found = left();
      if (found) resolve(found);
      else reject(new Error(`The ${words}’s script ran but left nothing`));
    };
    script.onerror = () => {
      loading.delete(src);
      reject(new Error(`The ${words}’s script couldn’t be loaded`));
    };
    document.head.append(script);
  });
  loading.set(src, made);
  return made;
}

export const loadWalkScript = (src: string): Promise<WalkStage> => loadScript(src, () => window.__ebWalkStage, 'walk');
export const loadNavScript = (src: string): Promise<NavLib> => loadScript(src, () => window.__ebNav, 'navigation');
export const loadStage2dScript = (src: string): Promise<Stage2d> =>
  loadScript(src, () => window.__ebStage2dStage, '2D stage');

/** An exported game's page: walk.js, nav.js and stage2d.js, named by the boot JSON. */
export const exportedWalk = (
  world: PackWorld | undefined,
  src: string | undefined,
  nav?: string,
  stage2d?: string,
): SpaceHost | undefined =>
  src === undefined && stage2d === undefined
    ? undefined
    : hostFor(
        world,
        () => (src === undefined ? Promise.reject(new Error('This game has no 3D stage')) : loadWalkScript(src)),
        nav === undefined ? undefined : () => loadNavScript(nav),
        stage2d === undefined ? undefined : () => loadStage2dScript(stage2d),
      );
