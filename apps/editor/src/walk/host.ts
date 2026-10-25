/**
 * The page's Space widget host (M5.8, D70, docs/specs/movement.md#the-space-widget): made from the
 * opened game's world, it draws each Space widget's space into its box by the stage, loaded the
 * first time one draws. What the widget asks before the stage has loaded waits for it. The stage
 * comes from the caller: the editor's own chunk, or an exported game's walk.js, so a page that only
 * hosts carries none of three or Rapier. Until the stage has drawn its first frame, the box shows
 * the space's name and Loading… (M5.9, docs/specs/worldspaces.md#the-space-widget).
 */
import type { PackWorld } from '@eb/core';
import type { SpaceAsk, SpaceDrawn, SpaceHost, WalkQuality } from '@eb/ui';

export interface WalkStage {
  startStage(box: HTMLElement, ask: SpaceAsk, world: PackWorld): Promise<SpaceDrawn>;
}

export type LoadStage = () => Promise<WalkStage>;

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

export function walkHost(world: PackWorld, load: LoadStage): SpaceHost {
  return {
    name: (space) => spaceName(world, space),
    draw(box, ask) {
      let drawn: SpaceDrawn | null = null;
      let stopped = false;
      let paused = false;
      let quality: WalkQuality = ask.quality;
      let taken = ask.taken;
      const loading = loadingIn(box, spaceName(world, ask.space) ?? ask.space);
      void load()
        .then((stage) => stage.startStage(box, { ...ask, quality, taken }, world))
        .then((made) => {
          // The stage resolves once its first frame is drawn: the space is there to see.
          loading.remove();
          if (stopped) return made.stop();
          drawn = made;
          if (paused) made.pause(true);
          if (quality !== ask.quality) made.quality(quality);
          if (taken !== ask.taken) made.taken(taken);
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
        stop() {
          stopped = true;
          loading.remove();
          drawn?.stop();
        },
      };
    },
  };
}
