// The gatehouse (M3.11): a slice of Chooser of the Slain, whose dusk scenes are ink, compiled into
// the dialogue kit's talks. The rings, the halls' standing and the flags are records; the desk and
// its days are this game's own.
import { weightedPolicy } from 'eb';
import { gate } from './gate';

export const modules = [gate];
export const start = 'desk';
export const policies = [weightedPolicy('chooser', { 'gate/judge': 1, 'dialogue/say': 2, 'dialogue/go-on': 1 })];
export const metrics = [
  { fact: 'gate.day', label: 'the day' },
  { fact: 'factions.standing', args: { faction: 'odin' }, label: 'Odin’s standing' },
  { fact: 'factions.standing', args: { faction: 'hel' }, label: 'Hel’s standing' },
  { fact: 'economy.amount', args: { resource: 'rings' }, label: 'rings' },
  { fact: 'flag.number', args: { flag: 'truth' }, label: 'truths told' },
  { fact: 'flag.on', args: { flag: 'sent-healer' }, label: 'sent the healer' },
];
