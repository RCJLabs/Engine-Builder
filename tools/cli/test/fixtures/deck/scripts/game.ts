// The boarding deck (M7.2's gate, D84): Space-Wrecked's example ship as a tilemap, two crew on their
// rounds and an alarm. What the crew do is their behaviours' records, and the alarm is data; this
// game gives the clock a Wait.
import { deck } from './deck';

export const modules = [deck];
export const start = 'shift';
