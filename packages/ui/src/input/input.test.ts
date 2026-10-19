import { describe, expect, it } from 'vitest';
import { type Gesture, type GestureState, gestureStep, IDLE, type PointerEventIn } from './gestures.ts';
import { BUTTONS, mergePads, PAD_START, type PadCommand, type PadInput, padActive, padStep } from './pad.ts';
import { type Box, nearest, scoreOf } from './spatial.ts';

const box = (left: number, top: number, width = 100, height = 44): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('nearest', () => {
  // A grid of buttons: two columns of three, 20 px apart.
  const grid = [box(0, 0), box(120, 0), box(0, 64), box(120, 64), box(0, 128), box(120, 128)];

  it('moves to the neighbour that way, and to none past the edge', () => {
    expect(nearest(grid[0] as Box, grid, 'right')).toBe(1);
    expect(nearest(grid[0] as Box, grid, 'down')).toBe(2);
    expect(nearest(grid[3] as Box, grid, 'up')).toBe(1);
    expect(nearest(grid[3] as Box, grid, 'left')).toBe(2);
    expect(nearest(grid[0] as Box, grid, 'up')).toBeUndefined();
    expect(nearest(grid[1] as Box, grid, 'right')).toBeUndefined();
    // Never itself, never wrapping.
    expect(nearest(grid[5] as Box, grid, 'down')).toBeUndefined();
  });

  it('prefers the box straight ahead to a nearer one off to the side', () => {
    const from = box(0, 0, 100, 44);
    const straight = box(0, 200, 100, 44);
    const aside = box(150, 60, 100, 44);
    // The one aside is outside the 45° cone: 50 across, but only 16 ahead.
    expect(scoreOf(from, aside, 'down')).toBeUndefined();
    expect(nearest(from, [aside, straight], 'down')).toBe(1);
  });

  it('scores ahead plus twice across plus a tenth of the offset, as Chooser does', () => {
    const from = box(0, 0, 100, 44);
    // 20 ahead, 10 across, centres 110 apart sideways.
    expect(scoreOf(from, box(110, 64, 100, 44), 'down')).toBeCloseTo(20 + 2 * 10 + 110 / 10);
    // Overlapping sideways: no gap across, only the offset.
    expect(scoreOf(from, box(50, 64, 100, 44), 'down')).toBeCloseTo(20 + 50 / 10);
  });

  it('takes a box reaching up to 4 px back as ahead, and not 5', () => {
    const from = box(0, 0, 100, 44);
    expect(scoreOf(from, box(0, 40, 100, 44), 'down')).toBeCloseTo(0);
    expect(scoreOf(from, box(0, 39, 100, 44), 'down')).toBeUndefined();
  });

  it('gives a tie to the first in the page’s order', () => {
    const from = box(100, 0);
    expect(nearest(from, [box(0, 100), box(200, 100)], 'down')).toBe(0);
  });
});

const input = (pressed: number[] = [], axes: number[] = [0, 0]): PadInput => {
  const buttons: boolean[] = Array(16).fill(false);
  for (const b of pressed) buttons[b] = true;
  return { buttons, axes };
};

/** Frames at these times, each with its input: every command each gave. */
function frames(steps: readonly (readonly [number, PadInput])[]): PadCommand[][] {
  let memory = PAD_START;
  return steps.map(([now, pad]) => {
    const step = padStep(memory, pad, now);
    memory = step.memory;
    return step.commands;
  });
}

describe('the gamepad', () => {
  it('presses, goes back and changes tab once per press', () => {
    expect(frames([[0, input([BUTTONS.a])]])).toEqual([[{ kind: 'press' }]]);
    expect(frames([[0, input([BUTTONS.b])]])).toEqual([[{ kind: 'back' }]]);
    expect(
      frames([
        [0, input([BUTTONS.rb])],
        [16, input([BUTTONS.rb])],
        [32, input()],
        [48, input([BUTTONS.lb])],
      ]),
    ).toEqual([[{ kind: 'tab', step: 1 }], [], [], [{ kind: 'tab', step: -1 }]]);
  });

  it('moves with the d-pad, repeating after 400 ms and then every 120', () => {
    const down = input([BUTTONS.down]);
    const moves = frames([
      [0, down],
      [399, down],
      [400, down],
      [519, down],
      [520, down],
      [600, input()],
      [616, down],
    ]).map((commands) => commands.length);
    expect(moves).toEqual([1, 0, 1, 0, 1, 0, 1]);
  });

  it('moves with the left stick past 0.5, and lets go only under 0.35', () => {
    const at = (x: number, y = 0) => input([], [x, y]);
    expect(frames([[0, at(0.49)]])).toEqual([[]]);
    expect(
      frames([
        [0, at(0.6)],
        [10, at(0.4)],
        [20, at(0.3)],
        [30, at(-0.7)],
      ]),
    ).toEqual([[{ kind: 'move', direction: 'right' }], [], [], [{ kind: 'move', direction: 'left' }]]);
    // The stronger axis wins.
    expect(frames([[0, at(0.6, -0.9)]])).toEqual([[{ kind: 'move', direction: 'up' }]]);
  });

  it('reads every pad as one', () => {
    const merged = mergePads([input([BUTTONS.a], [0.2, 0]), null, input([], [-0.8, 0.1])]);
    expect(merged.buttons[BUTTONS.a]).toBe(true);
    expect(merged.axes).toEqual([-0.8, 0.1]);
    expect(padActive(merged)).toBe(true);
    expect(padActive(input([], [0.3, -0.2]))).toBe(false);
  });
});

/** The gestures a run of pointer events makes. */
function gesturesOf(events: readonly PointerEventIn[]): Gesture[] {
  let state: GestureState = IDLE;
  const out: Gesture[] = [];
  for (const event of events) {
    const step = gestureStep(state, event);
    state = step.state;
    if (step.gesture) out.push(step.gesture);
  }
  return out;
}

const at = (x: number, y: number, t: number) => ({ x, y, t });
const swipe = (dx: number, dy: number, ms: number): PointerEventIn[] => [
  { kind: 'down', id: 1, at: at(100, 100, 0) },
  { kind: 'move', id: 1, at: at(100 + dx / 2, 100 + dy / 2, ms / 2) },
  { kind: 'up', id: 1, at: at(100 + dx, 100 + dy, ms) },
];

describe('gestures', () => {
  it('knows a swipe left and right: 48 px sideways, twice as far as up or down, within 800 ms', () => {
    expect(gesturesOf(swipe(60, 10, 200))).toEqual([{ kind: 'swipe', direction: 'right' }]);
    expect(gesturesOf(swipe(-48, 0, 200))).toEqual([{ kind: 'swipe', direction: 'left' }]);
    expect(gesturesOf(swipe(47, 0, 200))).toEqual([]);
    expect(gesturesOf(swipe(60, 31, 200))).toEqual([]);
    expect(gesturesOf(swipe(60, 0, 801))).toEqual([]);
  });

  it('knows a tap from a long press, and a small wobble is still a tap', () => {
    const press = (ms: number, wobble = 0): PointerEventIn[] => [
      { kind: 'down', id: 1, at: at(0, 0, 0) },
      { kind: 'move', id: 1, at: at(wobble, 0, ms / 2) },
      { kind: 'up', id: 1, at: at(wobble, 0, ms) },
    ];
    expect(gesturesOf(press(100, 9))).toEqual([{ kind: 'tap' }]);
    expect(gesturesOf(press(450))).toEqual([{ kind: 'long-press' }]);
    expect(gesturesOf(press(100, 10))).toEqual([]);
  });

  it('spends a gesture a second finger joins, and drops one the browser cancels', () => {
    const two: PointerEventIn[] = [
      { kind: 'down', id: 1, at: at(100, 100, 0) },
      { kind: 'down', id: 2, at: at(200, 100, 10) },
      { kind: 'move', id: 1, at: at(200, 100, 50) },
      { kind: 'up', id: 2, at: at(300, 100, 60) },
      { kind: 'up', id: 1, at: at(200, 100, 100) },
    ];
    expect(gesturesOf(two)).toEqual([]);
    const [down, move] = swipe(80, 0, 200);
    expect(gesturesOf([down as PointerEventIn, move as PointerEventIn, { kind: 'cancel', id: 1 }])).toEqual([]);
    // After either, the next swipe is read again.
    expect(gesturesOf([...two, ...swipe(80, 0, 200)])).toEqual([{ kind: 'swipe', direction: 'right' }]);
  });
});
