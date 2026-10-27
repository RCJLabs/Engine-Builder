/**
 * The 2D stage's canvas in its box (M7.1, D83, docs/specs/2d-scenes.md#the-view): a canvas of art
 * pixels at the scale rule's whole scale, shown pixelated from the box's top-left, sized again as
 * the box is; and a drag on it pans the camera, the world following the finger.
 */
import { clampCamera, type Point, panned } from './camera.ts';
import { fitScale, type Scaled } from './scale.ts';

export interface View2d {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** The box's size now, at the scale it is drawn at. */
  scaled(): Scaled & { readonly dpr: number };
  camera(): Point;
  /** The camera moved, kept within the space. */
  look(at: Point): void;
  stop(): void;
}

export function createView(
  box: HTMLElement,
  fit: readonly [number, number],
  size: Point,
  start: Point,
  changed: () => void,
): View2d {
  const canvas = document.createElement('canvas');
  canvas.className = 'eb-stage2d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    imageRendering: 'pixelated',
    touchAction: 'none',
  });
  box.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  let now = { ...fitScale(1, 1, 1, fit), dpr: 1 };
  let centre: Point = start;
  const size2 = () => {
    const dpr = window.devicePixelRatio || 1;
    now = { ...fitScale(box.clientWidth, box.clientHeight, dpr, fit), dpr };
    canvas.width = now.cols;
    canvas.height = now.rows;
    canvas.style.width = `${(now.cols * now.scale) / dpr}px`;
    canvas.style.height = `${(now.rows * now.scale) / dpr}px`;
    centre = clampCamera(centre, [now.cols, now.rows], size);
    changed();
  };
  size2();
  const sized = new ResizeObserver(size2);
  sized.observe(box);

  let drag: { id: number; from: Point; camera: Point } | null = null;
  const down = (e: PointerEvent) => {
    drag = { id: e.pointerId, from: [e.clientX, e.clientY], camera: centre };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const by: Point = [e.clientX - drag.from[0], e.clientY - drag.from[1]];
    centre = clampCamera(panned(drag.camera, by, now.dpr, now.scale), [now.cols, now.rows], size);
    changed();
  };
  const up = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  return {
    canvas,
    ctx,
    scaled: () => now,
    camera: () => centre,
    look(at) {
      centre = clampCamera(at, [now.cols, now.rows], size);
      changed();
    },
    stop() {
      sized.disconnect();
      canvas.remove();
    },
  };
}
