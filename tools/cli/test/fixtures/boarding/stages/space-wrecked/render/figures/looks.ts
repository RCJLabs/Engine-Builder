// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// What a figure can wear: the `look` of each crew job and enemy
// (data/jobs.json, data/enemies.json) and the `held` shape of each weapon
// (data/weapons.json). The figures draw these; tools/validate-data.js checks
// the data against them, so a look names only what can be drawn.
//
// A look is { suit, build, helmet, back, marks }: one of two suits (Evan's
// pick, M23b), a build, and a piece for each of the suit's slots.
//   eva       a puffy suit with a bubble helmet and a pack
//             helmet  bubble (a dark visor) | lamps (and two lamps) | bar (a
//                     band of light for a visor)
//             back    life (a life-support pack) | tools (a pack, a mast and
//                     a tool rack) | tanks (twin tanks) | junk (a pack with
//                     scrap strapped on) | med (a slim pack marked with a
//                     plus) | none
//             marks   plain | stripes (bands of trim on the arms and legs)
//   skinsuit  a close-fitting suit with lines of light, a smooth helmet
//             helmet  egg (a visor that wraps round) | fin (and a fin) |
//                     crest (and a low crest) | mirror (a dark visor)
//             back    spine (a slim pack) | jump (a jump pack) | none
//             marks   seams (lines of light) | plates (and shoulder plates in
//                     the trim)

export interface Look {
  suit: string;
  build: string;
  helmet: string;
  back: string;
  marks: string;
}

export interface Held {
  length: number;
  height: number;
  bore: number;
  hands: number;
}

export const BUILDS = ['light', 'standard', 'heavy'];
export const SUITS: Record<string, { helmet: string[]; back: string[]; marks: string[] }> = {
  eva: { helmet: ['bubble', 'lamps', 'bar'], back: ['life', 'tools', 'tanks', 'junk', 'med', 'none'], marks: ['plain', 'stripes'] },
  skinsuit: { helmet: ['egg', 'fin', 'crest', 'mirror'], back: ['spine', 'jump', 'none'], marks: ['seams', 'plates'] },
};
export const LOOK_KEYS = ['suit', 'build', 'helmet', 'back', 'marks'];

// A weapon in hand, in cells: its length from stock to muzzle, the height
// of its body, the thickness of its barrel, and whether it takes one hand or
// two.
export const HELD_KEYS = ['length', 'height', 'bore', 'hands'];
export const HELD_RANGES: Record<string, [number, number]> = { length: [0.08, 0.6], height: [0.02, 0.12], bore: [0.004, 0.03] };

// What a unit wears when its kind has no look (a test's, or content made
// before looks): a plain suit and a carbine.
export const PLAIN_LOOK: Look = { suit: 'eva', build: 'standard', helmet: 'bubble', back: 'life', marks: 'plain' };
export const PLAIN_HELD: Held = { length: 0.32, height: 0.07, bore: 0.01, hands: 2 };

// The problems with a look or a held shape, as messages (none if it is
// fine).
export function lookProblems(look: Record<string, string>): string[] {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return [`look must be { ${LOOK_KEYS.join(', ')} }`];
  const problems: string[] = [];
  for (const key of Object.keys(look)) if (!LOOK_KEYS.includes(key)) problems.push(`look: unknown field "${key}"`);
  const suit = SUITS[look.suit];
  if (!suit) return [...problems, `look.suit must be one of ${Object.keys(SUITS).join(', ')}`];
  if (!BUILDS.includes(look.build)) problems.push(`look.build must be one of ${BUILDS.join(', ')}`);
  for (const slot of ['helmet', 'back', 'marks'] as const) {
    if (!suit[slot].includes(look[slot])) problems.push(`look.${slot} for a ${look.suit} suit must be one of ${suit[slot].join(', ')}`);
  }
  return problems;
}

export function heldProblems(held: Record<string, number>): string[] {
  if (!held || typeof held !== 'object' || Array.isArray(held)) return [`held must be { ${HELD_KEYS.join(', ')} }`];
  const problems: string[] = [];
  for (const key of Object.keys(held)) if (!HELD_KEYS.includes(key)) problems.push(`held: unknown field "${key}"`);
  for (const [key, [min, max]] of Object.entries(HELD_RANGES)) {
    if (!(typeof held[key] === 'number' && held[key] >= min && held[key] <= max)) problems.push(`held.${key} must be a number from ${min} to ${max}`);
  }
  if (held.hands !== 1 && held.hands !== 2) problems.push('held.hands must be 1 or 2');
  return problems;
}
