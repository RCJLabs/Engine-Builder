// The valley (M4.6): a map drawn by hand in Dirtbag's style. Home, town and three crags joined by
// roads that take hours and cost cash, each drive along the quickest; the town pays a shift and a
// crag logs a tick. Records and the inventory, economy, time and maps kits; the van is this
// game's own.
import { randomPolicy } from 'eb';
import { valley } from './valley';

export const modules = [valley];
export const start = 'driving';
export const policies = [randomPolicy];
export const metrics = [
  'time.day',
  { fact: 'economy.amount', args: { resource: 'ticks' }, label: 'ticks' },
  { fact: 'economy.amount', args: { resource: 'cash' }, label: 'cash' },
];
