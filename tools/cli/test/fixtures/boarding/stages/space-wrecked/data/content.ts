// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// What the board reads of Space-Wrecked's data files, copied as they stand:
// the tiles legend (data/modules.json "tiles"), each crew job's look
// (data/jobs.json), the boarders' looks (data/enemies.json, since M7.5) and
// the held shape of the weapon it carries (data/weapons.json). A stage reads
// no files, so these are its own.
import type { Held, Look } from '../render/figures/looks.ts';

// data/modules.json: a room's interior template's characters.
export const TILES: Record<string, string> = {
  '.': 'floor',
  h: 'half cover',
  H: 'full cover',
  '#': 'machinery',
  c: 'console',
  a: 'airlock',
};

// data/jobs.json: each job's look and weapon.
export const JOBS: Record<string, { name: string; look: Look; weapon: string }> = {
  marine: { name: 'Marine', look: { suit: 'skinsuit', build: 'standard', helmet: 'fin', back: 'spine', marks: 'plates' }, weapon: 'rifle' },
  engineer: { name: 'Engineer', look: { suit: 'eva', build: 'standard', helmet: 'lamps', back: 'tools', marks: 'stripes' }, weapon: 'shotgun' },
  medic: { name: 'Medic', look: { suit: 'eva', build: 'light', helmet: 'bubble', back: 'med', marks: 'stripes' }, weapon: 'pistol' },
  pilot: { name: 'Pilot', look: { suit: 'skinsuit', build: 'light', helmet: 'egg', back: 'jump', marks: 'seams' }, weapon: 'pistol' },
  scout: { name: 'Scout', look: { suit: 'skinsuit', build: 'light', helmet: 'mirror', back: 'spine', marks: 'seams' }, weapon: 'longrifle' },
  xenobiologist: { name: 'Xenobiologist', look: { suit: 'eva', build: 'standard', helmet: 'bar', back: 'tanks', marks: 'plain' }, weapon: 'dartgun' },
  quartermaster: { name: 'Quartermaster', look: { suit: 'skinsuit', build: 'heavy', helmet: 'crest', back: 'spine', marks: 'plates' }, weapon: 'carbine' },
};

// data/enemies.json: the boarders' looks and weapons.
export const ENEMIES: Record<string, { name: string; look: Look; weapon: string }> = {
  pirate: { name: 'Pirate', look: { suit: 'skinsuit', build: 'standard', helmet: 'crest', back: 'none', marks: 'plates' }, weapon: 'carbine' },
  brute: { name: 'Pirate brute', look: { suit: 'skinsuit', build: 'heavy', helmet: 'egg', back: 'spine', marks: 'plates' }, weapon: 'shotgun' },
};

// data/weapons.json: each weapon's shape in hand.
export const WEAPONS: Record<string, { held: Held }> = {
  rifle: { held: { length: 0.42, height: 0.075, bore: 0.011, hands: 2 } },
  shotgun: { held: { length: 0.36, height: 0.085, bore: 0.018, hands: 2 } },
  pistol: { held: { length: 0.13, height: 0.055, bore: 0.009, hands: 1 } },
  carbine: { held: { length: 0.32, height: 0.07, bore: 0.01, hands: 2 } },
  longrifle: { held: { length: 0.46, height: 0.07, bore: 0.01, hands: 2 } },
  dartgun: { held: { length: 0.22, height: 0.06, bore: 0.014, hands: 1 } },
};
