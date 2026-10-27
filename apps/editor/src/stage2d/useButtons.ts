/**
 * The uses of a 2D space as the page's own buttons (M7.1, D83, docs/specs/2d-scenes.md#play), one
 * over each used sprite, 44 px at least: a tap or a click uses it, Tab and Shift+Tab move among them
 * (the shell's spatial focus and a pad's too), and Enter, Space or E uses the one focused. Focusing
 * one brings it into view, so every use is in reach without a pointer.
 */
import type { Point } from './camera.ts';
import type { Drawn } from './draw.ts';
import { centreOf, targetOf } from './uses.ts';

export interface UseShown {
  readonly path: string;
  readonly label: string;
}

export interface UseButtons {
  /** After each frame: each button over its sprite as drawn. */
  place(drawn: ReadonlyMap<string, Drawn>, scale: number, dpr: number, corner: Point, rows: number): void;
  /** The uses there are now: a taken one goes. */
  set(uses: readonly UseShown[]): void;
  /** The hook's: each button, its label and its box in CSS pixels. */
  shown(): { path: string; label: string; box: { x: number; y: number; w: number; h: number } }[];
  stop(): void;
}

export function createUseButtons(
  box: HTMLElement,
  use: (path: string) => void,
  focus: (centre: Point) => void,
): UseButtons {
  const layer = document.createElement('div');
  layer.className = 'eb-stage2d-uses';
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  box.append(layer);
  const buttons = new Map<string, { button: HTMLButtonElement; label: string; world?: Point }>();

  const make = ({ path, label }: UseShown) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'eb-stage2d-use';
    button.setAttribute('aria-label', label);
    button.dataset.path = path;
    Object.assign(button.style, { position: 'absolute', pointerEvents: 'auto' });
    button.addEventListener('click', () => use(path));
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'e' && e.key !== 'E') return;
      e.preventDefault();
      use(path);
    });
    button.addEventListener('focus', () => {
      const world = buttons.get(path)?.world;
      if (world) focus(world);
    });
    layer.append(button);
    buttons.set(path, { button, label });
  };

  return {
    set(uses) {
      const now = new Set(uses.map((u) => u.path));
      for (const [path, { button }] of buttons)
        if (!now.has(path)) {
          button.remove();
          buttons.delete(path);
        }
      for (const shown of uses) if (!buttons.has(shown.path)) make(shown);
    },
    place(drawn, scale, dpr, corner, rows) {
      for (const [path, entry] of buttons) {
        const seen = drawn.get(path);
        entry.button.hidden = !seen;
        if (!seen) continue;
        const css = targetOf(seen.box, scale, dpr);
        Object.assign(entry.button.style, {
          left: `${css.x}px`,
          top: `${css.y}px`,
          width: `${css.w}px`,
          height: `${css.h}px`,
        });
        // Its place in the world, for focus: the box back from the canvas.
        entry.world = centreOf({
          x: seen.box.x + corner[0],
          y: rows - seen.box.y - seen.box.h + corner[1],
          w: seen.box.w,
          h: seen.box.h,
        });
      }
    },
    shown: () =>
      [...buttons].map(([path, { button, label }]) => ({
        path,
        label,
        box: {
          x: Number.parseFloat(button.style.left),
          y: Number.parseFloat(button.style.top),
          w: Number.parseFloat(button.style.width),
          h: Number.parseFloat(button.style.height),
        },
      })),
    stop() {
      layer.remove();
    },
  };
}
