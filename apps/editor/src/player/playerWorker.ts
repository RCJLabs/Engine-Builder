/** The player page's game worker (M4.1): its script beside the page, as a module. */
import { type GameWorker, gameWorker } from './gameWorker.ts';

export const playerWorker = (): GameWorker =>
  gameWorker(new Worker(new URL('./player.worker.ts', import.meta.url), { type: 'module' }));
