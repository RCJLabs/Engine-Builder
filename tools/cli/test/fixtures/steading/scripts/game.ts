// The steading (M3.5): a slice of Landnam. Its neighbours, their bands and drift, the goods they
// trade and a calendar of 24-day seasons are records and project.json, through the inventory,
// economy, factions and time kits; the day's pass, the raids and winter are sheets; trading,
// raiding and tribute are this game's own.
import { weightedPolicy } from 'eb';
import { steading } from './steading';

export const modules = [steading];
export const start = 'steading';
export const policies = [
  weightedPolicy('jarl', {
    'steading/trade': 4,
    'steading/raid': 1,
    'steading/tribute': 1,
    'steading/rest': 3,
    'economy/buy': 3,
    'economy/sell': 1,
    'economy/leave': 2,
  }),
];
export const metrics = [
  'time.day',
  { fact: 'flag.number', args: { flag: 'hunger' }, label: 'hungry days' },
  { fact: 'factions.standing', args: { faction: 'grimsgarth' }, label: 'Grimsgarth' },
  { fact: 'factions.standing', args: { faction: 'reed-camp' }, label: 'the Reed Camp' },
  { fact: 'steading.raids', label: 'raids' },
];
