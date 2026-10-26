/**
 * The walk's plain functions (M5.8, D70, docs/specs/movement.md#controls): the controls, the floating
 * stick, the cameras, the zones and the motion, and the solids placed through prefabs.
 */
import { describe, expect, it } from 'vitest';
import { FIRST, heldPitch, lookOf, shotOf, THIRD } from './cameras.ts';
import { intentOf, MOUSE_DEGREES, PAD_LOOK, TOUCH_DEGREES } from './controls.ts';
import { fallAfter, GRAVITY, JUMP, jumpOf, MOST_STEPS, pushed, RUN, STEP, stepOf, stepsFor, WALK } from './motion.ts';
import { modelSolid, partsOf, spawnOf, WORLD_FRAME, within, yawOf } from './solids.ts';
import { DEAD_ZONE, knobOf, NO_PUSH, pushOf, STICK_SIZE } from './stick.ts';
import { answered, inZone, stepZones } from './zones.ts';

const close = (a: readonly number[], b: readonly number[], by = 1e-9) =>
  a.every((v, i) => Math.abs(v - (b[i] as number)) <= by);

describe('the controls', () => {
  const keys = (...codes: string[]) => ({ keys: new Set(codes) });
  it('walk by WASD or the arrows, the push held to one, run with Shift and jump with Space', () => {
    expect(intentOf(keys('KeyW'), 0).move).toEqual([0, 1]);
    expect(close(intentOf(keys('ArrowDown', 'ArrowLeft'), 0).move, [-Math.SQRT1_2, -Math.SQRT1_2])).toBe(true);
    expect(intentOf(keys('KeyA', 'KeyD'), 0).move).toEqual([0, 0]);
    expect(intentOf(keys('ShiftLeft', 'KeyW'), 0).run).toBe(true);
    expect(intentOf(keys('Space'), 0).jump).toBe(true);
    expect(intentOf(keys(), 0)).toEqual({
      move: [0, 0],
      run: false,
      jump: false,
      use: false,
      attack: false,
      look: [0, 0],
    });
    expect(intentOf(keys('KeyE'), 0).use).toBe(true);
  });

  it('take a pad’s left stick past its dead zone, running past 0.9, its right stick turning 150°/s, A jumping', () => {
    const pad = (axes: number[], a = false) => ({ keys: new Set<string>(), pad: { axes, a } });
    expect(intentOf(pad([0.1, -0.1]), 1 / 60).move).toEqual([0, 0]);
    expect(intentOf(pad([0, -0.5]), 1 / 60).move).toEqual([0, 0.5]);
    expect(intentOf(pad([0, -0.5]), 1 / 60).run).toBe(false);
    expect(intentOf(pad([0, -0.95]), 1 / 60).run).toBe(true);
    expect(intentOf(pad([0, 0, 1, 0]), 0.5).look).toEqual([-PAD_LOOK / 2, 0]);
    expect(intentOf(pad([0, 0, 0, -1]), 0.5).look).toEqual([0, PAD_LOOK / 2]);
    expect(intentOf(pad([0, 0], true), 0).jump).toBe(true);
  });

  it('turn by a drag: the mouse 0.25° a pixel, a touch 0.3°, right and down turning right and down', () => {
    expect(intentOf({ keys: new Set(), drag: { x: 10, y: 4, by: 'mouse' } }, 0).look).toEqual([
      -10 * MOUSE_DEGREES,
      -4 * MOUSE_DEGREES,
    ]);
    expect(intentOf({ keys: new Set(), drag: { x: 10, y: 0, by: 'touch' } }, 0).look[0]).toBeCloseTo(
      -10 * TOUCH_DEGREES,
    );
  });

  it('take the strongest push of keys, pad and stick, and the stick’s run and the jump button', () => {
    const held = { keys: new Set(['KeyD']), stick: { x: 0, y: 0.5, run: false }, pad: { axes: [0, -0.3], a: false } };
    expect(intentOf(held, 0).move).toEqual([1, 0]);
    expect(intentOf({ keys: new Set(), stick: { x: 0.3, y: 0.9, run: true }, jumpButton: true }, 0)).toMatchObject({
      move: [0.3, 0.9],
      run: true,
      jump: true,
    });
  });
});

describe('the floating stick', () => {
  const reach = STICK_SIZE / 2;
  it('pushes nothing inside its dead zone, then from nothing at its edge to all of it at its reach, up being forward', () => {
    expect(pushOf({ x: 100, y: 100 }, { x: 100 + reach * DEAD_ZONE * 0.9, y: 100 })).toBe(NO_PUSH);
    const full = pushOf({ x: 100, y: 100 }, { x: 100, y: 100 - reach * 2 });
    expect(close([full.x, full.y], [0, 1])).toBe(true);
    expect(full.run).toBe(true);
    const half = pushOf({ x: 0, y: 0 }, { x: reach * (DEAD_ZONE + (1 - DEAD_ZONE) / 2), y: 0 });
    expect(half.x).toBeCloseTo(0.5);
    expect(half.run).toBe(false);
    expect(pushOf({ x: 0, y: 0 }, { x: reach * 0.86, y: 0 }).run).toBe(true);
  });

  it('draws its knob where the thumb is, held to the reach', () => {
    expect(knobOf({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    const held = knobOf({ x: 0, y: 0 }, { x: reach * 3, y: 0 });
    expect(held).toEqual({ x: reach, y: 0 });
  });
});

describe('the cameras', () => {
  const open = () => null;
  it('look along -z at yaw 0, turning left as yaw grows', () => {
    expect(close(lookOf(0, 0), [0, 0, -1])).toBe(true);
    expect(close(lookOf(90, 0), [-1, 0, 0])).toBe(true);
    expect(lookOf(0, -15)[1]).toBeLessThan(0);
  });

  it('stand 4 m back from 1.6 m over the feet in third person, and at the eyes in first', () => {
    const third = shotOf('third', [0, 0, 0], 0, -15, open);
    expect(third.distance).toBe(THIRD.back);
    expect(close(third.target, [0, THIRD.up, 0])).toBe(true);
    // Back along a look 15° down: behind and above the head.
    expect(third.at[2]).toBeGreaterThan(3.8);
    expect(third.at[1]).toBeGreaterThan(THIRD.up + 1);
    const first = shotOf('first', [1, 2, 3], 0, 0, open);
    expect(close(first.at, [1, 2 + FIRST.eyes, 3])).toBe(true);
  });

  it('pull in to 0.2 m short of what a ray meets, never nearer than 0.6 m', () => {
    expect(shotOf('third', [0, 0, 0], 0, 0, () => 2).distance).toBeCloseTo(1.8);
    expect(shotOf('third', [0, 0, 0], 0, 0, () => 0.3).distance).toBe(THIRD.nearest);
    expect(shotOf('third', [0, 0, 0], 0, 0, () => 9).distance).toBe(THIRD.back);
  });

  it('hold the pitch to ±60° in third person and ±85° in first', () => {
    expect(heldPitch('third', -80)).toBe(-60);
    expect(heldPitch('first', -80)).toBe(-80);
    expect(heldPitch('first', 99)).toBe(85);
  });
});

describe('the zones', () => {
  const box = { kind: 'box', path: 'gate', center: [0, 1, 0], turn: [0, 0, 0, 1], half: [1, 1, 1] } as const;
  const ball = { kind: 'ball', path: 'pool', center: [0, 0, 0], radius: 1 } as const;
  const body = (x: number, y = 0) => ({ feet: [x, y, 0] as const, height: 1.8, radius: 0.35 });
  it('hold a capsule whose low point, middle or high point is inside', () => {
    expect(inZone(box, body(0))).toBe(true);
    expect(inZone(box, body(1.2))).toBe(false);
    expect(inZone(ball, body(0))).toBe(true);
    // Its feet 2 m down: only its high point, at -0.55, is in the ball; 3 m down, none is.
    expect(inZone(ball, body(0, -2))).toBe(true);
    expect(inZone(ball, body(0, -3))).toBe(false);
    const turned = {
      ...box,
      turn: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)] as const,
      half: [3, 1, 0.2] as const,
    };
    // A long thin zone turned 45°: along x it is no longer, but along its own long side it is.
    expect(inZone({ ...box, half: [3, 1, 0.2] }, body(2))).toBe(true);
    expect(inZone(turned, body(2))).toBe(false);
    expect(inZone(turned, { ...body(0), feet: [Math.SQRT2, 0, -Math.SQRT2] })).toBe(true);
  });

  it('send a zone once as it is entered, again only after leaving, or the next step when dropped', () => {
    const first = stepZones(new Map(), new Set(['gate']));
    expect(first.send).toEqual(['gate']);
    expect(stepZones(first.states, new Set(['gate'])).send).toEqual([]);
    const refused = answered(first.states, 'gate', 'refused');
    expect(stepZones(refused, new Set(['gate'])).send).toEqual([]);
    const left = stepZones(refused, new Set());
    expect(stepZones(left.states, new Set(['gate'])).send).toEqual(['gate']);
    const dropped = answered(first.states, 'gate', 'dropped');
    expect(stepZones(dropped, new Set(['gate'])).send).toEqual(['gate']);
    // An answer for a zone left meanwhile changes nothing.
    expect(answered(left.states, 'gate', 'accepted').get('gate')).toBeUndefined();
  });
});

describe('a jump between frames', () => {
  it('waits through a frame with no step for the next that has one, and is spent there', () => {
    // Pressed on a frame of 8 ms, a 120 Hz screen's: no step, so it waits.
    expect(jumpOf(true, false, 0)).toEqual({ jump: true, waiting: true });
    // Let go by the next frame, which steps: it jumps there, and waits no more.
    expect(jumpOf(false, true, 1)).toEqual({ jump: true, waiting: false });
    expect(jumpOf(false, false, 1)).toEqual({ jump: false, waiting: false });
    expect(jumpOf(false, false, 0)).toEqual({ jump: false, waiting: false });
  });
});

describe('the motion', () => {
  const intent = (move: [number, number], run = false, jump = false) => ({
    move,
    run,
    jump,
    use: false,
    attack: false,
    look: [0, 0] as [number, number],
  });
  it('walks at 2.5 m/s and runs at 5, forward along the yaw', () => {
    const walk = stepOf(intent([0, 1]), 0, { vy: 0, grounded: true });
    expect(close([walk.delta[0], walk.delta[2]], [0, -WALK * STEP])).toBe(true);
    expect(stepOf(intent([0, 1], true), 0, { vy: 0, grounded: true }).delta[2]).toBeCloseTo(-RUN * STEP);
    expect(close(pushed(intent([1, 0]), 90), [0, -1])).toBe(true);
  });

  it('jumps at 6 m/s from the ground only, and falls at 18 m/s² in the air', () => {
    expect(stepOf(intent([0, 0], false, true), 0, { vy: 0, grounded: true }).vy).toBe(JUMP);
    expect(stepOf(intent([0, 0], false, true), 0, { vy: 2, grounded: false }).vy).toBeCloseTo(2 - GRAVITY * STEP);
    expect(fallAfter(-3, -0.05, -0.05, true)).toEqual({ vy: 0, grounded: true });
    // Rising into a ceiling: stopped.
    expect(fallAfter(4, 0.06, 0, false)).toEqual({ vy: 0, grounded: false });
  });

  it('steps at 60 Hz, at most 5 a frame, a slow frame dropping what it couldn’t step', () => {
    expect(stepsFor(0, 1 / 30).steps).toBe(2);
    const slow = stepsFor(0, 1);
    expect(slow).toEqual({ steps: MOST_STEPS, carried: 0 });
    const part = stepsFor(0, STEP * 1.5);
    expect(part.steps).toBe(1);
    expect(part.carried).toBeCloseTo(STEP / 2);
  });
});

describe('the solids', () => {
  const at = (x: number, y: number, z: number) => [x, y, z] as const;
  it('compose a placement’s frame with what it places: turned, scaled and moved', () => {
    const half = Math.SQRT1_2;
    const parent = { at: at(10, 0, 0), turn: [0, half, 0, half] as const, scale: at(2, 2, 2) };
    const f = within(parent, { at: at(1, 0, 0), turn: [0, 0, 0, 1], scale: at(1, 1, 1) });
    expect(close(f.at, [10, 0, -2])).toBe(true);
    expect(f.scale).toEqual([2, 2, 2]);
    expect(yawOf(parent.turn)).toBeCloseTo(90);
    expect(yawOf(WORLD_FRAME.turn)).toBeCloseTo(0);
  });

  it('size a model’s collider by its record’s scale inside the placement, and refuse one that can’t be made', () => {
    const box = modelSolid(
      'crate',
      { ...WORLD_FRAME, at: at(1, 2, 3) },
      { shape: 'box', center: [0, 0.4, 0], size: [0.8, 0.8, 0.8] },
      2,
    );
    expect(box).toMatchObject({ kind: 'box', center: [1, 2.8, 3], half: [0.8, 0.8, 0.8] });
    expect(modelSolid('x', WORLD_FRAME, { shape: 'sphere', radius: 0 })).toBeNull();
    expect(modelSolid('x', WORLD_FRAME, { shape: 'capsule', radius: 0.5, height: 0.5 })).toBeNull();
    expect(modelSolid('x', WORLD_FRAME, { shape: 'hull', points: [[0, 0, 0]] })).toBeNull();
  });

  it('find colliders, zones the sim has and spawns, through a prefab and its overrides', () => {
    const prefabs = new Map([
      [
        'shed',
        {
          name: 'Shed',
          objects: [
            { id: 'wall', shape: 'box' as const, scale: at(4, 2, 0.2), components: { collider: {} } },
            { id: 'door', shape: 'box' as const, at: at(0, 0, 1), components: { trigger: { effects: [] } } },
          ],
        },
      ],
    ]);
    const space = {
      name: 'Yard',
      objects: [
        { id: 'start', shape: 'box' as const, turn: at(0, 90, 0), components: { spawn: {} } },
        { id: 'home', shape: 'box' as const, at: at(0, 0, 5), components: { spawn: { start: true, view: 'first' } } },
        {
          id: 'ball',
          shape: 'sphere' as const,
          at: at(3, 0, 0),
          components: { collider: { shape: 'sphere', moves: true } },
        },
        { id: 'shed', prefab: 'shed', at: at(10, 0, 0), overrides: { wall: { scale: at(6, 2, 0.2) } } },
        { id: 'loose', shape: 'box' as const, components: { trigger: { effects: [] } } },
      ],
    };
    const parts = partsOf(space as never, prefabs as never, () => null, new Set(['shed/door']));
    expect(parts.solids.map((s) => [s.path, s.kind])).toEqual([
      ['ball', 'ball'],
      ['shed/wall', 'box'],
    ]);
    expect(parts.solids[0]).toMatchObject({ center: [3, 0.5, 0], radius: 0.5, moves: true });
    expect(parts.solids[1]).toMatchObject({ center: [10, 1, 0], half: [3, 1, 0.1], moves: false });
    // The loose trigger isn't one the sim has: never sent, never drawn as a zone.
    expect(parts.zones.map((z) => z.path)).toEqual(['shed/door']);
    expect(parts.zones[0]).toMatchObject({ kind: 'box', center: [10, 0.5, 1] });
    expect(parts.spawns.map((s) => [s.path, Math.round(s.yaw), s.start, s.view])).toEqual([
      ['start', 90, false, 'third'],
      ['home', 0, true, 'first'],
    ]);
    expect(spawnOf(parts.spawns)?.path).toBe('home');
    expect(spawnOf(parts.spawns.slice(0, 1))?.path).toBe('start');
    expect(spawnOf([])).toBeUndefined();
  });
});
