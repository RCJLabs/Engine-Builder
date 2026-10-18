// The arena (M3.4): a slice of Ludus. Its gladiators, their stats, traits and injuries, and the
// armoury's gear are records of the stats, gear, inventory and economy kits, which project.json
// lists; the bouts are this game's own.
import { timeModule, weightedPolicy } from 'eb';
import { arena } from './arena';

export const modules = [timeModule({ calendar: { ticksPerDay: 1 } }), arena];
export const start = 'arena';
export const policies = [
  weightedPolicy('lanista', {
    'arena/bout': 5,
    'arena/rest': 3,
    'arena/shop': 1,
    'arena/arm': 3,
    'economy/buy': 3,
    'economy/sell': 1,
    'economy/leave': 2,
  }),
];
export const metrics = [
  'time.day',
  { fact: 'economy.amount', args: { resource: 'denarii' }, label: 'denarii' },
  { fact: 'arena.best', label: 'most wins' },
];
