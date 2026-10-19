/**
 * The gamepad's loop on the page (M4.2, docs/specs/input.md#gamepad): read each animation frame
 * while a pad is connected, and stopped when none is (Chooser's gamepad.ts), so a game without one
 * spends nothing on it. What the frames mean is pad.ts's.
 */
import { useEffect, useRef } from 'preact/hooks';
import { mergePads, PAD_START, type PadCommand, type PadInput, padActive, padStep } from './pad.ts';

const readPad = (pad: Gamepad | null): PadInput | null =>
  pad && {
    buttons: Array.from(pad.buttons, (button) => button.pressed || button.value > 0.5),
    axes: Array.from(pad.axes),
  };

const anyPad = () => Array.from(navigator.getGamepads()).some(Boolean);

/** Calls `handle` with each frame's commands, and `using` on each frame the player touches the pad. */
export function useGamepad(handle: (commands: readonly PadCommand[]) => void, using: () => void): void {
  const latest = useRef({ handle, using });
  latest.current = { handle, using };
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    let frame = 0;
    let running = false;
    let memory = PAD_START;
    const tick = (now: number) => {
      if (!anyPad()) {
        running = false;
        memory = PAD_START;
        return;
      }
      const input = mergePads(Array.from(navigator.getGamepads(), readPad));
      const step = padStep(memory, input, now);
      memory = step.memory;
      if (padActive(input)) latest.current.using();
      if (step.commands.length > 0) latest.current.handle(step.commands);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener('gamepadconnected', start);
    if (anyPad()) start();
    return () => {
      window.removeEventListener('gamepadconnected', start);
      cancelAnimationFrame(frame);
    };
  }, []);
}
