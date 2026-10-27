// The lighthouse (a template, M6.9, D81): a rock at night, its keeper gone, a ship due before
// dawn. The rooms, the logbook's scene, the chest, the locked store and the lamp are data; light.ts
// ends the game once the lamp is lit; keeper is its bot.
import { weightedPolicy } from 'eb';
import { light } from './light';

export const modules = [light];
export const start = 'out';
// It uses what a room offers, takes what the chest holds and reads what the logbook says, at random,
// never putting anything back.
export const policies = [
  weightedPolicy('keeper', {
    'world/use': 3,
    'world/trigger': 1,
    'inventory/take': 3,
    'inventory/put': 0,
    'dialogue/say': 2,
  }),
];
export const metrics = [{ fact: 'light.lit', label: 'lit' }];
