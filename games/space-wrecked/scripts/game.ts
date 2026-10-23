// Space-Wrecked, acts 1 and 2 (M4.12, D62): RCJLabs's game rebuilt with the engine's kits from its
// own data, which tools/import-space-wrecked turns into records/. Act 1 builds the ship at the
// hangar on the job board's pay; act 2 runs five sectors to a world past the charts, and ends at
// Settle. What the kits don't do is these scripts': the campaign, refitting, the crew's wounds, the
// board and the run. captain.ts is the bot eb sim and the editor's Run play it with.
import { board } from './board';
import { campaign } from './campaign';
import { captain } from './captain';
import { crew } from './crew';
import { refit } from './refit';
import { run } from './run';

export const modules = [campaign, refit, crew, board, run];
export const start = 'choose';
export const policies = [captain];
export const metrics = [
  { fact: 'campaign.ending', label: 'ending' },
  { fact: 'campaign.act', label: 'act' },
  { fact: 'campaign.background', label: 'background' },
  { fact: 'run.sector', label: 'sector' },
  { fact: 'flag.number', args: { flag: 'heat' }, label: 'heat' },
  { fact: 'economy.amount', args: { resource: 'credits' }, label: 'credits' },
  { fact: 'roster.count', label: 'crew' },
  { fact: 'quests.tally', args: { state: 'done' }, label: 'quests done' },
  { fact: 'time.day', label: 'days' },
];
