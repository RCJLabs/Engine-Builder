/**
 * The Play panel's one worker (M4.1): the shell's requests and the debug tools' (M4.9) go through
 * it in turn, so a debug step lands between two of the game's steps, never inside one.
 */
import { playClient } from './playClient.ts';

export const playing = playClient();
