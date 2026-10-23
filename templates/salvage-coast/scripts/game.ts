// Salvage coast (a template, M4.11): a salvage skipper on a stormy coast with five voyages to pay
// off the boat. The coast, its wrecks and weather, the raiders, the chandlery, the contracts and
// the debt are records; the harbour and how the game ends are this game's own (harbour.ts), and
// skipper.ts is the bot `eb sim` and the editor's Run play it with.
import { harbour } from './harbour';
import { skipper } from './skipper';

export const modules = [harbour];
export const start = 'harbour';
export const policies = [skipper];
export const metrics = [
  { fact: 'harbour.ending', label: 'ending' },
  { fact: 'harbour.voyages', label: 'voyages' },
  { fact: 'economy.amount', args: { resource: 'debt' }, label: 'debt' },
  { fact: 'economy.amount', args: { resource: 'coin' }, label: 'coin' },
  { fact: 'stats.current', args: { actor: 'boat', stat: 'hull' }, label: 'hull' },
  { fact: 'encounters.won', args: { encounter: 'raiders' }, label: 'raiders beaten' },
];
