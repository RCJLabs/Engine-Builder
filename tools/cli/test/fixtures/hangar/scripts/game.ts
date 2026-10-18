// The hangar (M3.3): a slice of Space-Wrecked's act 1. Its parts, its credits, Dutch's yard and the
// job board's pay and drops are records of the inventory and economy kits, which project.json lists.
import { timeModule, weightedPolicy } from 'eb';
import { hangar } from './hangar';

export const modules = [timeModule({ calendar: { ticksPerDay: 1 } }), hangar];
export const start = 'hangar';
export const policies = [
  weightedPolicy('worker', {
    'hangar/work': 6,
    'hangar/shop': 2,
    'economy/buy': 3,
    'economy/sell': 1,
    'economy/leave': 2,
    'hangar/launch': 50,
  }),
];
export const metrics = [
  { fact: 'economy.amount', args: { resource: 'credits' }, label: 'credits' },
  'time.day',
  { fact: 'inventory.tagged', args: { tag: 'part' }, label: 'parts' },
];
