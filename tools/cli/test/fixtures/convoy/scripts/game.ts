// The convoy (M3.7): a slice of Wasteland Protocol. Its road, the raiders, traders, loan shark and
// survivor met there, the debt due three nodes on, the pursuit two days behind and the survivor's
// people two choices later are records and a sheet, through the inventory, economy, time and
// events kits; driving, scavenging, camping and coming home are this game's own.
import { weightedPolicy } from 'eb';
import { convoy } from './convoy';

export const modules = [convoy];
export const start = 'convoy';
export const policies = [
  weightedPolicy('scout', {
    'convoy/travel': 6,
    'convoy/scavenge': 1,
    'convoy/camp': 1,
    'convoy/arrive': 1,
    'events/choose': 2,
  }),
];
export const metrics = [
  'time.day',
  { fact: 'flag.number', args: { flag: 'nodes' }, label: 'nodes' },
  { fact: 'economy.amount', args: { resource: 'scrap' }, label: 'scrap' },
  { fact: 'economy.amount', args: { resource: 'fuel' }, label: 'fuel' },
  { fact: 'events.choices', label: 'choices made' },
  { fact: 'events.booked', label: 'consequences still to land' },
  { fact: 'events.chose', args: { event: 'loan-shark', choice: 'borrow' }, label: 'borrowed' },
];
