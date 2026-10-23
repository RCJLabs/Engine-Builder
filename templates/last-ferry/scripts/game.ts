// The last ferry (a template, M4.11): one night's crossing, four passengers, three endings. The
// passengers, what they say and what the player answers are ink scenes; the flags they set, the
// crossing sheet that opens them and the passengers' quests are records. ferry.ts rows, and keeps
// the ending the landing picks.
import { weightedPolicy } from 'eb';
import { ferry } from './ferry';

export const modules = [ferry];
export const start = 'crossing';
export const policies = [
  weightedPolicy('ferryman', { 'ferry/row-on': 1, 'ferry/come-ashore': 1, 'dialogue/say': 1, 'dialogue/go-on': 1 }),
];
export const metrics = [
  { fact: 'flag.number', args: { flag: 'ending' }, label: 'ending (1 lights, 2 patrol, 3 far bank)' },
  { fact: 'ferry.leg', label: 'legs rowed' },
];
