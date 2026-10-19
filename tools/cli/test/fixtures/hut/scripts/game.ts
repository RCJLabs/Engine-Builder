// The hut (Phase 3's gate, D50): a season keeping a mountain hut above a valley village. The store,
// the guild and the village, the talks, the storm, the evening's scene and the quests are records
// and a sheet; carrying loads, resting and the season's days are this game's own.
import { weightedPolicy } from 'eb';
import { hut } from './hut';

export const modules = [hut];
export const start = 'hut';
export const policies = [
  weightedPolicy('keeper', {
    'hut/carry': 3,
    'hut/rest': 1,
    'hut/store': 1,
    'hut/visit': 2,
    'hut/close': 1,
    'economy/buy': 2,
    'economy/leave': 2,
    'dialogue/say': 3,
    'dialogue/go-on': 1,
    'events/choose': 2,
  }),
];
export const metrics = [
  'time.day',
  { fact: 'economy.amount', args: { resource: 'coins' }, label: 'coins' },
  { fact: 'factions.standing', args: { faction: 'guild' }, label: 'the guild' },
  { fact: 'factions.standing', args: { faction: 'village' }, label: 'the village' },
];
