/**
 * The Scene panel's camera as plain functions (M5.1, docs/specs/viewport.md#the-camera): it orbits
 * a target, pans across the view, zooms in and out, flies on desktop with W, A, S, D, Q and E, and
 * frames what is chosen. three's OrbitControls would bring three's WebGL renderer along with it.
 */
import { add, cross, times, unit, type Vec3 } from './vec.ts';

export interface Orbit {
  readonly target: Vec3;
  /** Degrees around the up axis; 0 looks along -z. */
  readonly yaw: number;
  /** Degrees above the ground the camera looks down from. */
  readonly pitch: number;
  /** Metres from the target. */
  readonly distance: number;
}

export const START: Orbit = { target: [0, 0, 0], yaw: 35, pitch: 30, distance: 14 };
export const FOV = 50;

const NEAREST = 0.5;
const FARTHEST = 400;
/** Degrees the camera turns for each pixel dragged. */
const TURN_PER_PX = 0.3;
const RAD = Math.PI / 180;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** From the target towards the camera. */
const backOf = (o: Orbit): Vec3 => [
  Math.cos(o.pitch * RAD) * Math.sin(o.yaw * RAD),
  Math.sin(o.pitch * RAD),
  Math.cos(o.pitch * RAD) * Math.cos(o.yaw * RAD),
];

export const eyeOf = (o: Orbit): Vec3 => add(o.target, times(backOf(o), o.distance));

/** The camera's right and up, as the screen's x and y run. */
export function screenAxes(o: Orbit): { right: Vec3; up: Vec3; forward: Vec3 } {
  const forward = times(backOf(o), -1);
  const right = unit(cross(forward, [0, 1, 0]));
  return { right, up: cross(right, forward), forward };
}

/** Dragged `dx`, `dy` pixels: right turns the view left round the target, down tips it to look from higher. */
export const turnedBy = (o: Orbit, dx: number, dy: number): Orbit => ({
  ...o,
  yaw: (((o.yaw - dx * TURN_PER_PX) % 360) + 360) % 360,
  pitch: clamp(o.pitch + dy * TURN_PER_PX, -85, 85),
});

/** Dragged `dx`, `dy` pixels in a view `viewPx` tall: the ground under the pointer follows it. */
export function pannedBy(o: Orbit, dx: number, dy: number, viewPx: number): Orbit {
  const perPx = (2 * o.distance * Math.tan((FOV * RAD) / 2)) / Math.max(1, viewPx);
  const { right, up } = screenAxes(o);
  return { ...o, target: add(o.target, add(times(right, -dx * perPx), times(up, dy * perPx))) };
}

/** Nearer by `factor` above 1, farther below it. */
export const zoomedBy = (o: Orbit, factor: number): Orbit => ({
  ...o,
  distance: clamp(o.distance / factor, NEAREST, FARTHEST),
});

/** Flown `metres` along the camera's right, up and forward: the target goes with it. */
export function flownBy(o: Orbit, way: Vec3, metres: number): Orbit {
  const { right, forward } = screenAxes(o);
  const step = add(add(times(right, way[0]), times([0, 1, 0], way[1])), times(forward, way[2]));
  return { ...o, target: add(o.target, times(step, metres)) };
}

/** The ball of `radius` about `centre` filling the view, seen from where the camera looks now. */
export const framed = (o: Orbit, centre: Vec3, radius: number): Orbit => ({
  ...o,
  target: centre,
  distance: clamp(Math.max(radius, 0.5) / Math.sin((FOV * RAD) / 2) + 0.5, NEAREST, FARTHEST),
});

/** Which way W, A, S, D, Q and E fly: right, up, forward. */
export const FLY_KEYS: Readonly<Record<string, Vec3>> = {
  KeyW: [0, 0, 1],
  KeyS: [0, 0, -1],
  KeyA: [-1, 0, 0],
  KeyD: [1, 0, 0],
  KeyE: [0, 1, 0],
  KeyQ: [0, -1, 0],
};
