// The yard (M3.9): a slice of Space-Wrecked's first act. The miner's debt with its deadline and two
// ways out, the drone bounty counted haul by haul, the name to be made in three steps and the
// chief's trust, which waits on the bounty, are quests; the miner's call is an event and a sheet,
// through the inventory, economy, time, events and quests kits. Salvage, rest and moving on are
// this game's own. eb adds each quest's state at the end to the metrics.
import { weightedPolicy } from 'eb';
import { yard } from './yard';

export const modules = [yard];
export const start = 'yard';
export const policies = [
  weightedPolicy('scavenger', {
    'yard/salvage': 4,
    'yard/rest': 1,
    'yard/leave': 1,
    'events/choose': 2,
  }),
];
export const metrics = [
  'time.day',
  { fact: 'economy.amount', args: { resource: 'credits' }, label: 'credits' },
  { fact: 'quests.tally', args: { state: 'done' }, label: 'quests done' },
];
