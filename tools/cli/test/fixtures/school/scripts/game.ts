// The school (M3.10): a slice of Ludus. A booking at the games that repeats all season, each time
// for a gladiator the quest picks at random from the roster, who is away until it ends and whose
// bout is rolled as it starts; and the rival house's challenge to the school's most famous man.
// Gladiators bought at market are the roster kit's, their fame the stats kit's, the days the time
// kit's and the bookings the quests kit's; drilling and the market's days are this game's own.
import { weightedPolicy } from 'eb';
import { school } from './school';

export const modules = [school];
export const start = 'school';
export const policies = [
  weightedPolicy('lanista', {
    'school/train': 4,
    'school/rest': 1,
    'school/market': 1,
    'school/book': 2,
    'roster/hire': 2,
    'roster/leave-hall': 2,
  }),
];
export const metrics = [
  'time.day',
  { fact: 'roster.count', label: 'gladiators' },
  { fact: 'school.bookings', label: 'bookings taken' },
];
