/**
 * Focus moved by direction on the page (M4.2, docs/specs/input.md#focus): the top screen's controls
 * that can take focus, their boxes, and spatial.ts's nearest. With no control focused, a direction
 * wakes focus on the screen's primary button, else its first (from chooser-of-the-dead's
 * gamepad.ts). The control a screen last had is Screen.tsx's to give back as it returns to the top.
 */
import { type Box, type Direction, nearest } from './spatial.ts';

const CONTROLS = 'button, [role="tab"], a[href], input, select, textarea';

/** The screen on top of the stack: the last one drawn in the game's box. */
export function topScreen(game: HTMLElement): HTMLElement | undefined {
  const screens = game.querySelectorAll<HTMLElement>(':scope > .eb-screen');
  return screens[screens.length - 1];
}

/** Whether a control can take focus now: a tab stop, enabled, drawn, and not inert or hidden. */
export function usable(control: HTMLElement): boolean {
  return (
    control.isConnected &&
    control.tabIndex >= 0 &&
    !(control as HTMLButtonElement).disabled &&
    control.closest('[inert], [aria-hidden="true"]') === null &&
    control.getClientRects().length > 0
  );
}

export const controlsOf = (screen: HTMLElement): HTMLElement[] =>
  [...screen.querySelectorAll<HTMLElement>(CONTROLS)].filter(usable);

const boxOf = (element: HTMLElement): Box => element.getBoundingClientRect();

/** Focus a control without the browser's jump, then bring it into view as little as it takes. */
export function focusControl(control: HTMLElement): void {
  control.focus({ preventScroll: true });
  control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** The control focus wakes on in a screen: its primary button, else its first. */
export function wakeOn(screen: HTMLElement): HTMLElement | undefined {
  const controls = controlsOf(screen);
  return controls.find((c) => c.classList.contains('eb-primary')) ?? controls[0];
}

/** How much of the main region one step scrolls when no control lies that way (Chooser's). */
const SCROLL_SHARE = 0.4;

/** One step of focus that way in the top screen. True when it moved, woke or scrolled. */
export function moveFocus(game: HTMLElement, direction: Direction): boolean {
  const screen = topScreen(game);
  if (!screen) return false;
  const active = document.activeElement as HTMLElement | null;
  const controls = controlsOf(screen);
  if (!active || !controls.includes(active)) {
    const woken = wakeOn(screen);
    if (woken) focusControl(woken);
    return woken !== undefined;
  }
  const others = controls.filter((control) => control !== active);
  const next = nearest(boxOf(active), others.map(boxOf), direction);
  if (next !== undefined) {
    focusControl(others[next] as HTMLElement);
    return true;
  }
  const main = screen.querySelector<HTMLElement>('.eb-main');
  if (!main || direction === 'left' || direction === 'right') return false;
  main.scrollBy({ top: (direction === 'up' ? -1 : 1) * main.clientHeight * SCROLL_SHARE });
  return true;
}

/** The tab list that holds focus, or else the top screen's first: where a pad's LB and RB act. */
export function tabsFor(game: HTMLElement): HTMLElement | undefined {
  const active = document.activeElement as HTMLElement | null;
  const holding = active?.closest<HTMLElement>('.eb-tabs');
  if (holding && game.contains(holding)) return holding;
  return topScreen(game)?.querySelector<HTMLElement>('.eb-tabs') ?? undefined;
}

/** The event a tab list hears to step its tab, from a pad's LB and RB or a swipe. */
export const TAB_STEP = 'eb-tab-step';
export const stepTabs = (tabs: HTMLElement, step: 1 | -1) =>
  tabs.dispatchEvent(new CustomEvent<1 | -1>(TAB_STEP, { detail: step }));
