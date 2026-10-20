// The drift (M4.6): a slice of Space-Wrecked's sector run. Three sectors made from the same rules,
// stations, a nebula and the rest rolled; jumps that cost supplies and heat; what each node holds,
// drawn from decks; and hunters waiting where the ship comes out once it runs hot, rolled by a
// sheet. Records and the inventory, economy, events and maps kits; the ship is this game's own.
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
];
