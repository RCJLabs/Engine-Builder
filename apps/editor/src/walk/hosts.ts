/**
 * The walk's hosts (M5.8, D70): every page's stage is walk.js, a classic script loaded the first
 * time a Space widget draws, so the Play panel walks what an export ships. One host a world, so the
 * Space widget keeps its stage across renders. Nothing here imports the stage: game.js stays light.
 */
import type { PackWorld } from '@eb/core';
import type { SpaceHost } from '@eb/ui';
import { type LoadStage, type WalkStage, walkHost } from './host.ts';

const made = new WeakMap<PackWorld, SpaceHost>();

export const hostFor = (world: PackWorld | undefined, load: LoadStage): SpaceHost | undefined => {
  if (!world) return undefined;
  let host = made.get(world);
  if (!host) {
    host = walkHost(world, load);
    made.set(world, host);
  }
  return host;
};

declare global {
  interface Window {
    /** What walk.js leaves when it runs (walk/entry.ts). */
    __ebWalkStage?: WalkStage;
  }
}

let loading: Promise<WalkStage> | null = null;

/**
 * walk.js run once, as a classic script: from its file beside the page, or from the page's own
 * `#eb-walk` element in a single-file export, by a blob URL, which file:// allows.
 */
export function loadWalkScript(src: string): Promise<WalkStage> {
  loading ??= new Promise<WalkStage>((resolve, reject) => {
    const script = document.createElement('script');
    let blob: string | null = null;
    if (src.startsWith('#')) {
      const text = document.getElementById(src.slice(1))?.textContent ?? '';
      blob = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      script.src = blob;
    } else script.src = src;
    script.onload = () => {
      if (blob) URL.revokeObjectURL(blob);
      if (window.__ebWalkStage) resolve(window.__ebWalkStage);
      else reject(new Error('The walk’s script ran but left no stage'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('The walk’s script couldn’t be loaded'));
    };
    document.head.append(script);
  });
  return loading;
}

/** An exported game's page: walk.js, named by the boot JSON. */
export const exportedWalk = (world: PackWorld | undefined, src: string | undefined): SpaceHost | undefined =>
  src === undefined ? undefined : hostFor(world, () => loadWalkScript(src));
