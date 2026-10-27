// Kaldvík (proof #2, M6.10, D82): a steading on Landnam's coast, its silver stolen into the old
// howe on the knoll. Who lives there, what they say, sell and ask are records; the shore, the hall,
// the smithy and the howe are spaces. kaldvik.ts waits an hour and ends the game once the silver is
// home; stranger.ts is its bot.
import { kaldvik } from './kaldvik';
import { stranger } from './stranger';

export const modules = [kaldvik];
export const start = 'out';
export const policies = [stranger];
export const metrics = [
  { fact: 'kaldvik.ended', label: 'ended' },
  { fact: 'economy.amount', args: { resource: 'silver' }, label: 'silver' },
  { fact: 'stats.current', args: { actor: 'stranger', stat: 'health' }, label: 'health' },
];
