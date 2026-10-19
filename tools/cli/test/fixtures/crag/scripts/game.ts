// The crag (M3.8): a slice of Dirtbag. Marge, whose beta comes with a bond, the gas money that
// costs, the send that is rolled, the gear in her van and the ranger checking permits at the gate
// are records and a sheet, through the inventory, economy and dialogue kits; work, the drive out,
// climbing and the trip's twelve days are this game's own.
import { weightedPolicy } from 'eb';
import { crag } from './crag';

export const modules = [crag];
export const start = 'town';
export const policies = [
  weightedPolicy('climber', {
    'crag/work': 2,
    'crag/drive': 2,
    'crag/climb': 4,
    'crag/leave': 1,
    'dialogue/say': 3,
    'dialogue/go-on': 1,
    'economy/buy': 1,
    'economy/sell': 1,
    'economy/leave': 2,
  }),
];
export const metrics = [
  { fact: 'crag.day', label: 'the day' },
  { fact: 'crag.climbs', label: 'days climbing' },
  { fact: 'flag.number', args: { flag: 'bond' }, label: 'bond' },
  { fact: 'flag.number', args: { flag: 'sends' }, label: 'sends' },
  { fact: 'economy.amount', args: { resource: 'cash' }, label: 'cash' },
  { fact: 'dialogue.talked', args: { talk: 'marge' }, label: 'talks with Marge' },
  { fact: 'dialogue.said', args: { talk: 'marge', option: 'beta' }, label: 'got the beta' },
];
