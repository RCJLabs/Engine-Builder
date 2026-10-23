// The drift (M4.6): a slice of Space-Wrecked's sector run. Three sectors made from the same rules,
// stations, a nebula and the rest rolled; jumps that cost supplies and heat; what each node holds,
// drawn from decks; and hunters waiting where the ship comes out once it runs hot, rolled by a
// sheet. Hostile ships are fought, hull and guns against theirs, worked out round by round with the
// odds shown (M4.7). Records and the inventory, economy, stats, events, maps and encounters kits;
// the ship's flying is this game's own.
import { drift } from './drift';
import { pilot } from './pilot';

export const modules = [drift];
export const start = 'flying';
export const policies = [pilot];
export const metrics = [
  { fact: 'maps.entered', label: 'sectors entered' },
  { fact: 'maps.at-end', label: 'through' },
  { fact: 'economy.amount', args: { resource: 'supplies' }, label: 'supplies' },
  { fact: 'economy.amount', args: { resource: 'credits' }, label: 'credits' },
  { fact: 'flag.number', args: { flag: 'heat' }, label: 'heat' },
  { fact: 'stats.current', args: { actor: 'ship', stat: 'hull' }, label: 'hull' },
  { fact: 'encounters.won', args: { encounter: 'raiders' }, label: 'raiders beaten' },
];
