// The hold: a game whose code is its project's own scripts (M3.2), which eb validate and eb sim run.
import { weightedPolicy } from 'eb';
import { hold } from './hold';

export const modules = [hold];
export const start = 'sea';
export const policies = [weightedPolicy('greedy', { 'hold/loot': 3, 'hold/sail': 1 })];
export const metrics = ['hold.count'];
