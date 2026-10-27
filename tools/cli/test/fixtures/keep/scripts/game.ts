// The keep (M7.1's gate, D83): a 2D space at night, two guards on the wall walk and a bell. What the
// guards do is their behaviours' records and the bell is data; this game gives the clock a Wait.
import { keep } from './keep';

export const modules = [keep];
export const start = 'night';
