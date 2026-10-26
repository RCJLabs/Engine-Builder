/**
 * The walk by touch (M5.8, D70, docs/specs/movement.md#controls): a stick that appears where a thumb
 * lands on the left half and follows it, a drag on the right half that looks, and a 64 px jump button
 * at the bottom right, inside the safe area. Drawn in the page's own DOM, over the canvas; styled
 * here, so the walk's one script carries everything it draws. A touch anywhere but a button that
 * lifts within TAP_MS and TAP_PX is a tap (M6.2), which walks the player there. In a space with
 * fights (M6.4), an Attack button of the same size stands above Jump.
 */
import { knobOf, NO_PUSH, type Push, pushOf, STICK_SIZE } from './stick.ts';

export const TAP_MS = 300;
export const TAP_PX = 10;

export interface Touches {
  take(): {
    readonly stick: Push;
    readonly jumpButton: boolean;
    readonly attackButton: boolean;
    readonly drag?: { x: number; y: number; by: 'touch' };
    /** A tap since the last frame, in CSS pixels from the box's top left. */
    readonly tap?: { x: number; y: number };
  };
  clear(): void;
  dispose(): void;
}

const KNOB = 48;
const JUMP = 64;

const styled = <E extends HTMLElement>(element: E, style: Partial<CSSStyleDeclaration>): E => {
  Object.assign(element.style, style);
  return element;
};

/** A round touch button at the bottom right, `above` pixels over the safe area's edge. */
function roundButton(label: string, className: string, above: number): HTMLButtonElement {
  const button = styled(document.createElement('button'), {
    position: 'absolute',
    right: 'max(12px, env(safe-area-inset-right))',
    bottom: `calc(max(12px, env(safe-area-inset-bottom)) + ${above}px)`,
    width: `${JUMP}px`,
    height: `${JUMP}px`,
    borderRadius: '50%',
    border: '2px solid rgb(255 255 255 / 0.8)',
    background: 'rgb(0 0 0 / 0.35)',
    color: '#ffffff',
    font: 'inherit',
    fontWeight: '600',
    touchAction: 'none',
    display: 'none',
  });
  button.type = 'button';
  button.textContent = label;
  button.className = className;
  return button;
}

/** A button held while a finger is on it, and counted once if lifted between frames. */
function holdable(button: HTMLButtonElement) {
  let held = false;
  let tapped = false;
  const press = (event: PointerEvent) => {
    held = true;
    tapped = true;
    button.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const release = () => {
    held = false;
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  return {
    take() {
      const was = held || tapped;
      tapped = false;
      return was;
    },
    clear() {
      held = false;
      tapped = false;
    },
  };
}

export function createTouches(box: HTMLElement, fights = false): Touches {
  const base = styled(document.createElement('div'), {
    position: 'absolute',
    width: `${STICK_SIZE}px`,
    height: `${STICK_SIZE}px`,
    marginLeft: `${-STICK_SIZE / 2}px`,
    marginTop: `${-STICK_SIZE / 2}px`,
    borderRadius: '50%',
    background: 'rgb(0 0 0 / 0.25)',
    border: '2px solid rgb(255 255 255 / 0.6)',
    pointerEvents: 'none',
    display: 'none',
  });
  base.className = 'walk-stick';
  const knob = styled(document.createElement('div'), {
    position: 'absolute',
    left: `${(STICK_SIZE - KNOB) / 2 - 2}px`,
    top: `${(STICK_SIZE - KNOB) / 2 - 2}px`,
    width: `${KNOB}px`,
    height: `${KNOB}px`,
    borderRadius: '50%',
    background: 'rgb(255 255 255 / 0.75)',
  });
  base.append(knob);
  const jump = roundButton('Jump', 'walk-jump', 0);
  const attack = fights ? roundButton('Attack', 'walk-attack', JUMP + 12) : null;
  const attacking = attack ? holdable(attack) : null;
  box.append(base, jump, ...(attack ? [attack] : []));

  let stick: { id: number; from: { x: number; y: number }; at: { x: number; y: number } } | null = null;
  let look: { id: number; x: number; y: number } | null = null;
  let drag = { x: 0, y: 0 };
  let jumping = false;
  // A tap shorter than a frame still jumps: the press counts until the next frame takes it.
  let tapped = false;
  /** Where and when each touch began, for a tap. */
  const began = new Map<number, { x: number; y: number; time: number }>();
  let tap: { x: number; y: number } | undefined;
  // Shown once the device is touched, or a coarse pointer says it will be.
  const show = () => {
    jump.style.display = 'block';
    if (attack) attack.style.display = 'block';
  };
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) show();

  const local = (event: PointerEvent) => {
    const rect = box.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, half: rect.width / 2 };
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || event.target === jump || event.target === attack) return;
    show();
    const at = local(event);
    const onButton = event.target instanceof Element && event.target.closest('button') !== null;
    if (!onButton) began.set(event.pointerId, { x: at.x, y: at.y, time: event.timeStamp });
    if (at.x < at.half && !stick) {
      stick = { id: event.pointerId, from: { x: at.x, y: at.y }, at: { x: at.x, y: at.y } };
      Object.assign(base.style, { display: 'block', left: `${at.x}px`, top: `${at.y}px` });
      knob.style.transform = 'translate(0px, 0px)';
    } else if (at.x >= at.half && !look) look = { id: event.pointerId, x: event.clientX, y: event.clientY };
    else return;
    box.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (stick?.id === event.pointerId) {
      const at = local(event);
      stick.at = { x: at.x, y: at.y };
      const k = knobOf(stick.from, stick.at);
      knob.style.transform = `translate(${k.x}px, ${k.y}px)`;
    } else if (look?.id === event.pointerId) {
      drag = { x: drag.x + event.clientX - look.x, y: drag.y + event.clientY - look.y };
      look = { id: look.id, x: event.clientX, y: event.clientY };
    }
  };
  const up = (event: PointerEvent) => {
    const start = began.get(event.pointerId);
    began.delete(event.pointerId);
    if (start && event.type === 'pointerup') {
      const at = local(event);
      const still = Math.hypot(at.x - start.x, at.y - start.y) <= TAP_PX;
      if (still && event.timeStamp - start.time <= TAP_MS) tap = { x: at.x, y: at.y };
    }
    if (stick?.id === event.pointerId) {
      stick = null;
      base.style.display = 'none';
    }
    if (look?.id === event.pointerId) look = null;
  };
  const press = (event: PointerEvent) => {
    jumping = true;
    tapped = true;
    jump.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const release = () => {
    jumping = false;
  };
  box.addEventListener('pointerdown', down);
  box.addEventListener('pointermove', move);
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
  jump.addEventListener('pointerdown', press);
  jump.addEventListener('pointerup', release);
  jump.addEventListener('pointercancel', release);

  return {
    take() {
      const moved = drag;
      drag = { x: 0, y: 0 };
      const jump = jumping || tapped;
      tapped = false;
      const tapAt = tap;
      tap = undefined;
      return {
        stick: stick ? pushOf(stick.from, stick.at) : NO_PUSH,
        jumpButton: jump,
        attackButton: attacking?.take() ?? false,
        ...(moved.x !== 0 || moved.y !== 0 ? { drag: { ...moved, by: 'touch' as const } } : {}),
        ...(tapAt ? { tap: tapAt } : {}),
      };
    },
    clear() {
      stick = null;
      look = null;
      jumping = false;
      tapped = false;
      tap = undefined;
      attacking?.clear();
      began.clear();
      drag = { x: 0, y: 0 };
      base.style.display = 'none';
    },
    dispose() {
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      base.remove();
      jump.remove();
      attack?.remove();
    },
  };
}
