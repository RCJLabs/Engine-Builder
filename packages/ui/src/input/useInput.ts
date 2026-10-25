/**
 * Keys, a gamepad and swipes in a game's box (M4.2, docs/specs/input.md): arrows and the pad move
 * focus on the top screen, A presses, Escape, B and a swipe right go Back, and LB, RB and a swipe
 * on tabs change tab. Each screen remembers the control it last had, for focus to go back to.
 * With nothing to go back from, Escape and B pause, as Start does (M4.3); a swipe doesn't.
 */
import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { moveFocus, stepTabs, tabsFor, topScreen, usable } from './focus.ts';
import type { PadCommand } from './pad.ts';
import type { Direction } from './spatial.ts';
import { useGamepad } from './useGamepad.ts';
import { useSwipes } from './useSwipes.ts';

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export interface Input {
  /** "pad" while the player is using a gamepad, which draws the focus rings; a key or a pointer clears it. */
  readonly device: 'pad' | undefined;
  /** The control a screen last had. */
  readonly remembered: (screen: HTMLElement) => HTMLElement | undefined;
}

export interface InputActions {
  /** Closes the top screen a button opened, if there is one. */
  readonly back: (() => void) | undefined;
  /** The shell's pause, when the shell has one. */
  readonly pause?: (() => void) | undefined;
  /** Commands are ignored while false: the shell's pause is over the game. */
  readonly on?: boolean;
}

export function useInput(box: RefObject<HTMLElement | null>, actions: InputActions): Input {
  const { back, pause, on = true } = actions;
  const [device, setDevice] = useState<'pad' | undefined>(undefined);
  const memory = useMemo(() => new WeakMap<HTMLElement, HTMLElement>(), []);
  const remembered = (screen: HTMLElement) => memory.get(screen);
  // Listened for on the game's box rather than given to it as props: the box is no control itself.
  const keyed = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const remember = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      const screen = target.closest<HTMLElement>('.eb-screen');
      if (screen && target.tabIndex >= 0) memory.set(screen, target);
    };
    const key = (event: KeyboardEvent) => keyed.current(event);
    const pointer = () => setDevice(undefined);
    element.addEventListener('focusin', remember);
    element.addEventListener('keydown', key);
    element.addEventListener('pointerdown', pointer);
    return () => {
      element.removeEventListener('focusin', remember);
      element.removeEventListener('keydown', key);
      element.removeEventListener('pointerdown', pointer);
    };
  }, [box, memory]);

  const move = (direction: Direction) => (box.current ? moveFocus(box.current, direction) : false);
  const press = () => {
    const game = box.current;
    const active = document.activeElement as HTMLElement | null;
    if (game && active && topScreen(game)?.contains(active) && usable(active)) active.click();
    else move('down');
  };
  const tab = (step: 1 | -1) => {
    const tabs = box.current ? tabsFor(box.current) : undefined;
    if (tabs) stepTabs(tabs, step);
  };
  // A space walked on the top screen takes the left stick and A, unless a control there has focus (M5.8).
  const walking = () => {
    const screen = box.current ? topScreen(box.current) : undefined;
    const active = document.activeElement as HTMLElement | null;
    const onControl = !!active && !!screen?.contains(active) && usable(active) && !active.closest('[data-eb-walk]');
    return !!screen?.querySelector('[data-eb-walk]') && !onControl;
  };
  const command = (c: PadCommand) => {
    if (c.kind === 'move') {
      if (!(c.stick && walking())) move(c.direction);
    } else if (c.kind === 'press') {
      if (!walking()) press();
    } else if (c.kind === 'back') (back ?? pause)?.();
    else if (c.kind === 'start') pause?.();
    else tab(c.step);
  };
  useGamepad(
    (commands) => {
      if (on) for (const c of commands) command(c);
    },
    () => setDevice('pad'),
  );
  useSwipes(box, (direction, from) => {
    // A drag on a space walked is the stage's: its stick and its look (M5.8).
    if (!on || from.closest('[data-eb-walk]')) return;
    const tabs = from.closest<HTMLElement>('.eb-tabs');
    const screen = box.current ? topScreen(box.current) : undefined;
    if (tabs && screen?.contains(tabs)) stepTabs(tabs, direction === 'left' ? 1 : -1);
    else if (direction === 'right') back?.();
  });
  keyed.current = (event: KeyboardEvent) => {
    setDevice(undefined);
    // Tabs take their own left and right first; modified keys are the browser's.
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const direction = ARROWS[event.key];
    if (direction !== undefined) {
      if (move(direction)) event.preventDefault();
    } else if (event.key === 'Escape' && (back ?? pause)) {
      event.preventDefault();
      event.stopPropagation();
      (back ?? pause)?.();
    }
  };
  return { device, remembered };
}
