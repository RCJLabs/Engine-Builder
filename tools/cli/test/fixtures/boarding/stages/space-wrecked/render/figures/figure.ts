// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// A figure on a battle map: a crew member or an enemy in their suit,
// posed, as solid faces (solid.js). Pure: where it stands, its look and its
// weapon's held shape (looks.js), its colors and its pose in, faces out.
// The skeleton (bones.js) is dressed in the look's suit (eva.js,
// skinsuit.js), then turned to face its way and moved onto the deck. The
// fight draws each figure once and keeps it (sprites.js).
//   pose.aim     0 at the ready to 1 aimed (shooting, or on overwatch)
//   pose.stride  the walk's phase (0 to 1, a stride of two steps), or null
//   pose.fall    0 standing to 1 lying on its back: it tips over backward,
//                its hands let go and the weapon drops beside it
// colors: { suit, trim, dark, under, visor, glass, lamp, gun }. detail (0
// to 1) thins the round parts out for figures drawn small.
import type { Face, Vec3 } from '../solid.ts';
import { bodyOf, bones, type Skeleton } from './bones.ts';
import { dressEva } from './eva.ts';
import { type Held, type Look, PLAIN_HELD, PLAIN_LOOK } from './looks.ts';
import { type Colors, type Kit, makeKit, norm } from './shapes.ts';
import { dressSkinsuit } from './skinsuit.ts';
import { weapon } from './weapon.ts';

export interface Pose {
  aim?: number;
  stride?: number | null;
  fall?: number;
}

type Dress = (kit: Kit, s: Skeleton, look: Look) => void;

export const FIGURE_TOP = 0.84; // the top of the tallest figure standing (a skinsuit's fin)
const MIDDLE = 0.38; // where a standing figure sorts, up from the deck
const LYING = 0.12; // and a figure lying down
const SLIDE = 0.38; // how far ahead its heels slide as it falls, so it lies on its tile
const DRESS: Record<string, Dress> = { eva: dressEva, skinsuit: dressSkinsuit };

export function figureFaces(out: Face[], { at: [cx, cy], facing: [fx, fy] }: { at: number[]; facing: number[] }, look: Look | undefined, held: Held | undefined, colors: Colors, pose: Pose = {}, detail = 1): void {
  const suit = look && DRESS[look.suit] ? look : PLAIN_LOOK;
  const hand = held ?? PLAIN_HELD;
  const fall = Math.min(1, Math.max(0, pose.fall ?? 0));
  const limp = Math.min(1, fall * 1.6);
  const body = bodyOf(suit.suit, suit.build);
  const s = bones(body, hand, { aim: pose.aim ?? 0, stride: pose.stride ?? null, limp });
  const world = ([u, v, w]: Vec3): Vec3 => [cx + u * fx - v * fy, cy + u * fy + v * fx, w];
  // Tipping over backward about the heels, which slide ahead.
  const [c, sn] = [Math.cos((fall * Math.PI) / 2), Math.sin((fall * Math.PI) / 2)];
  const tip = ([u, v, w]: Vec3): Vec3 => [SLIDE * fall + u * c - w * sn, v, u * sn + w * c];
  const kit = makeKit({ place: (p) => world(tip(p)), colors, detail, girth: body.girth });
  (DRESS[suit.suit] as Dress)(kit, s, suit);
  if (limp < 0.5) weapon(kit, s, hand);
  // Nothing goes through the deck: a figure on its back rests on its pack.
  let low = 0;
  for (const face of kit.faces) for (const p of face.pts) low = Math.min(low, p[2]);
  if (low < 0) for (const face of kit.faces) face.pts = face.pts.map(([x, y, z]) => [x, y, z - low]);
  out.push(...kit.faces);
  if (limp >= 0.5) {
    // On the deck beside it, resting on its magazine or its grip.
    const deck = makeKit({ place: world, colors, detail, girth: body.girth });
    weapon(deck, { grip: [0.2, -0.26, hand.hands === 1 ? 0.06 : 0.072], dir: norm([0.85, 0.45, 0]) }, hand);
    out.push(...deck.faces);
  }
}

// Where a figure sorts among the map's faces and is drawn from: its middle,
// standing or lying.
export function anchorOf([cx, cy]: number[], fall = 0): Vec3 {
  return [cx, cy, MIDDLE + (LYING - MIDDLE) * Math.min(1, Math.max(0, fall))];
}
