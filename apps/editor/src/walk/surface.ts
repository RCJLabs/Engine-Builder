/**
 * Where the walk is drawn and what it is given (M5.8, D70, docs/specs/movement.md#the-stage): a
 * canvas in the Space widget's box, the view on it at a quality tier, the keys, the mouse and a pad
 * read through it, and the frame clock Auto steps down by (D69). A new tier is a new view on a new
 * canvas, as in the Scene panel; the walk itself is the stage's and is kept.
 */
import { createFrameClock, type FrameClock } from '../perf/stepDown.ts';
import { TIERS, type TierName } from '../perf/tiers.ts';
import { createInputs, type Inputs } from './inputs.ts';
import { createWalkView, type WalkView } from './view.ts';
import type { WalkSpace } from './world.ts';

export interface Tier {
  readonly name: TierName;
  /** Chosen by Auto, so it may step down. */
  readonly auto: boolean;
}

export interface Surface {
  readonly view: WalkView;
  readonly inputs: Inputs;
  readonly clock: FrameClock;
  readonly tier: Tier;
  retier(tier: Tier): Promise<void>;
  dispose(): void;
}

function canvasIn(box: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    touchAction: 'none',
  });
  box.prepend(canvas);
  return canvas;
}

async function drawnAt(box: HTMLElement, space: WalkSpace, tier: Tier) {
  const canvas = canvasIn(box);
  const view = await createWalkView(box, canvas, TIERS[tier.name], space);
  return { canvas, view, inputs: createInputs(box, canvas), clock: createFrameClock(), tier };
}

export async function createSurface(box: HTMLElement, space: WalkSpace, tier: Tier): Promise<Surface> {
  let now = await drawnAt(box, space, tier);
  const drop = (old: typeof now) => {
    old.inputs.dispose();
    old.view.dispose();
    old.canvas.remove();
  };
  return {
    get view() {
      return now.view;
    },
    get inputs() {
      return now.inputs;
    },
    get clock() {
      return now.clock;
    },
    get tier() {
      return now.tier;
    },
    async retier(next) {
      const old = now;
      now = await drawnAt(box, space, next);
      drop(old);
    },
    dispose: () => drop(now),
  };
}
