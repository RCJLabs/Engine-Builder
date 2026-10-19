// The crew (M3.6): a slice of Space-Wrecked. Its backgrounds, the stations that offer them, the
// traits and their fees, ranks at 3 and 8 fights, wounds that last days and bonds that grow with
// fights won are records and a sheet, through the inventory, economy, stats, time and roster kits;
// the fights, the jumps and the berths are this game's own.
import { weightedPolicy } from 'eb';
import { crew } from './crew';

export const modules = [crew];
export const start = 'crew';
export const policies = [
  weightedPolicy('captain', {
    'crew/fight': 4,
    'crew/rest': 2,
    'crew/dock': 2,
    'crew/jump': 1,
    'crew/fit': 1,
    'roster/hire': 3,
    'roster/leave-hall': 2,
  }),
];
export const metrics = [
  'time.day',
  { fact: 'roster.count', label: 'the crew' },
  { fact: 'crew.won', label: 'fights won' },
  { fact: 'crew.dead', label: 'the dead' },
  { fact: 'roster.ranked', args: { rank: 'veteran' }, label: 'veterans' },
  { fact: 'economy.amount', args: { resource: 'credits' }, label: 'credits' },
];
