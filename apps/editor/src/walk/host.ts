/**
 * The page's Space widget host (M5.8, D70, docs/specs/movement.md#the-space-widget): made from the
 * opened game's world, it draws each Space widget's space into its box by the stage, loaded the
 * first time one draws. What the widget asks before the stage has loaded waits for it. The stage
 * comes from the caller: the editor's own chunk, or an exported game's walk.js, so a page that only
 * hosts carries none of three or Rapier.
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

export function walkHost(world: PackWorld, load: LoadStage): SpaceHost {
  return {
    name: (space) => spaceName(world, space),
    draw(box, ask) {
      let drawn: SpaceDrawn | null = null;
      let stopped = false;
      let paused = false;
      let quality: WalkQuality = ask.quality;
      void load()
        .then((stage) => stage.startStage(box, { ...ask, quality }, world))
        .then((made) => {
          if (stopped) return made.stop();
          drawn = made;
          if (paused) made.pause(true);
          if (quality !== ask.quality) made.quality(quality);
        })
        .catch((error: unknown) => {
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
        stop() {
          stopped = true;
          drawn?.stop();
        },
      };
    },
  };
}
