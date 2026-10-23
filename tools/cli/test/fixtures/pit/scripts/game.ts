// The pit (M4.7): a slice of Ludus. Twelve days of games: each day a bout is offered from the
// deck, a thraex, a murmillo, a retiarius to the death or a melee, and the lanista sends Crixus or
// Spartacus, or the whole ludus, or turns it down. The bouts are the encounters kit's, worked out
// round by round with their odds shown; the gladiators are the roster's and the stats kit's, the
// purse the economy kit's and the offers the events kit's. The days and the yard are this game's.
import { lanista } from './lanista';
import { pit } from './pit';

export const modules = [pit];
export const start = 'yard';
export const policies = [lanista];
export const metrics = [
  { fact: 'pit.day', label: 'days' },
  { fact: 'roster.count', label: 'gladiators' },
  { fact: 'economy.amount', args: { resource: 'denarii' }, label: 'denarii' },
  { fact: 'encounters.won', args: { encounter: 'thraex' }, label: 'thraeces beaten' },
  { fact: 'encounters.won', args: { encounter: 'retiarius' }, label: 'retiarii beaten' },
];
