// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// The weapon a figure holds, drawn from its held shape (looks.js): along
// `dir` from the grip, a stock, a body with its magazine and sight, and a
// barrel; a pistol is a body and a grip.
import type { Vec3 } from '../solid.ts';
import type { Held } from './looks.ts';
import { add, cross, type Kit, norm, scale, slab } from './shapes.ts';

export function weapon(kit: Kit, { grip, dir }: { grip: Vec3; dir: Vec3 }, held: Held): void {
  const { gun, dark } = kit.colors;
  const at = (t: number) => add(grip, scale(dir, t));
  const down = norm(cross(cross(dir, [0, 0, 1]), dir));
  const [len, high, wide] = [held.length, held.height / 2, held.height * 0.28];
  if (held.hands === 1) {
    slab(kit, at(-0.025), at(len - 0.025), wide * 0.9, high * 0.55, gun, 0.6);
    slab(kit, at(-0.012), add(at(0.012), scale(down, -0.055)), wide * 0.75, 0.012, dark);
    return;
  }
  const [stock, body] = [len * 0.3, len * 0.42];
  slab(kit, at(-stock), at(-stock * 0.35), wide * 0.8, high * 0.85, gun, 0.15);
  slab(kit, at(-stock * 0.35), at(body), wide, high, gun, 0.45);
  slab(kit, at(body), at(len - stock), held.bore, held.bore * 1.2, gun, high / (held.bore * 1.2));
  slab(kit, at(0.02), add(at(0.045), scale(down, -0.065)), wide * 0.7, 0.012, dark);
  slab(kit, add(at(0), [0, 0, high * 1.6]), add(at(0.07), [0, 0, high * 1.6]), 0.01, 0.012, dark);
}
