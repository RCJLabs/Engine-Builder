// The valley hamlet (a template, M6.9, D81): a hamlet in a green valley, bandits in the woods above
// it and one more in the cave under the hill. Who lives there, what they say, what they sell and
// what the reeve asks are records; the green, the smithy and the cave are spaces. hamlet.ts waits an
// hour and ends the game once the bandits are gone; wanderer.ts is its bot.
import { hamlet } from './hamlet';
import { wanderer } from './wanderer';

export const modules = [hamlet];
export const start = 'out';
export const policies = [wanderer];
export const metrics = [
  { fact: 'hamlet.ended', label: 'ended' },
  { fact: 'economy.amount', args: { resource: 'coin' }, label: 'coin' },
  { fact: 'stats.current', args: { actor: 'hero', stat: 'health' }, label: 'health' },
];
