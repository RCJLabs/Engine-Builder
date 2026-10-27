/**
 * The page's Space widget host (M5.8, D70, docs/specs/movement.md#the-space-widget): made from the
 * opened game's world, it draws each Space widget's space into its box by the stage, loaded the
 * first time one draws. What the widget asks before the stage has loaded waits for it. The stage
 * comes from the caller: the editor's own chunk, or an exported game's walk.js, so a page that only
 * hosts carries none of three or Rapier. Until the stage has drawn its first frame, the box shows
 * the space's name and Loading… (M5.9, docs/specs/worldspaces.md#the-space-widget).
 */
import type { PackWorld } from '@eb/core';
import type { MapAsk, SpaceAsk, SpaceDrawn, SpaceHost, SpaceMapShown, WalkQuality } from '@eb/ui';
import type { NavLib } from '../nav/lib.ts';

/** nav.js, loaded by the stage once it walks a space with a navmesh (M6.2). */
export type LoadNav = () => Promise<NavLib>;

export interface WalkStage {
  startStage(box: HTMLElement, ask: SpaceAsk, world: PackWorld, nav?: LoadNav): Promise<SpaceDrawn>;
  /** A space's map and its pins (M6.6): walk.js works out where everything is, as the walk does. */
  mapOf(world: PackWorld, ask: MapAsk): SpaceMapShown;
}

export type LoadStage = () => Promise<WalkStage>;

/** The 2D stage (M7.1, D83): stage2d.js's, or the editor's own chunk. */
export interface Stage2d {
  startStage2d(box: HTMLElement, ask: SpaceAsk, world: PackWorld): Promise<SpaceDrawn>;
}

export type LoadFlat = () => Promise<Stage2d>;

/** Whether a space of the world is drawn in 2D. */
const isFlat = (world: PackWorld, id: string): boolean =>
  Object.hasOwn(world.spaces, id) && (world.spaces[id] as { view?: unknown }).view === '2d';

/** The space's name, as the Space widget names it for assistive tech when it has no label. */
export function spaceName(world: PackWorld, id: string): string | undefined {
  const space = Object.hasOwn(world.spaces, id) ? (world.spaces[id] as { name?: unknown }) : undefined;
  return typeof space?.name === 'string' ? space.name : undefined;
}

/** The loading screen, in the theme's colours (screens.css): a status, so it is read out as it comes. */
function loadingIn(box: HTMLElement, name: string): HTMLElement {
  const screen = document.createElement('div');
  screen.className = 'eb-space-loading';
  screen.setAttribute('role', 'status');
  const [title, words] = [document.createElement('p'), document.createElement('p')];
  title.className = 'eb-text eb-heading';
  title.textContent = name;
  words.className = 'eb-text eb-caption';
  words.textContent = 'Loading…';
  screen.append(title, words);
  box.append(screen);
  return screen;
}

export function walkHost(world: PackWorld, load: LoadStage, nav?: LoadNav, flat?: LoadFlat): SpaceHost {
  return {
    name: (space) => spaceName(world, space),
    map: (ask) => load().then((stage) => stage.mapOf(world, ask)),
    draw(box, ask) {
      let drawn: SpaceDrawn | null = null;
      let stopped = false;
      let paused = false;
      let quality: WalkQuality = ask.quality;
      let taken = ask.taken;
      let npcs = ask.npcs;
      const loading = loadingIn(box, spaceName(world, ask.space) ?? ask.space);
      // A 2D space is stage2d.js's (M7.1): the same ask, the same handle.
      const started = (asked: SpaceAsk): Promise<SpaceDrawn> =>
        isFlat(world, ask.space)
          ? flat
            ? flat().then((stage) => stage.startStage2d(box, asked, world))
            : Promise.reject(new Error('This page has no 2D stage'))
          : load().then((stage) => stage.startStage(box, asked, world, nav));
      void started({ ...ask, quality, taken, ...(npcs ? { npcs } : {}) })
        .then((made) => {
          // The stage resolves once its first frame is drawn: the space is there to see.
          loading.remove();
          if (stopped) return made.stop();
          drawn = made;
          if (paused) made.pause(true);
          if (quality !== ask.quality) made.quality(quality);
          if (taken !== ask.taken) made.taken(taken);
          if (npcs !== ask.npcs && npcs) made.npcs?.(npcs);
        })
        .catch((error: unknown) => {
          loading.remove();
          if (!stopped)
            box.textContent = `The space couldn’t be drawn: ${error instanceof Error ? error.message : String(error)}`;
        });
      return {
        pause(on) {
          paused = on;
          drawn?.pause(on);
        },
        quality(next) {
          quality = next;
          drawn?.quality(next);
        },
        taken(paths) {
          taken = paths;
          drawn?.taken(paths);
        },
        npcs(next) {
          npcs = next;
          drawn?.npcs?.(next);
        },
        stop() {
          stopped = true;
          loading.remove();
          drawn?.stop();
        },
      };
    },
  };
}
