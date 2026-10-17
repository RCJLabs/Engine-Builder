/**
 * Salvage run with the mistake the runner exists to find: crew/rest is offered even when no one
 * is hurt, and refused then, as the bot in the kernel tests used to try it.
 */
import { type ActionSpec, defineModule } from '@eb/core';
import { modules as salvage } from './salvage-game.ts';

const crew = salvage.find((m) => m.id === 'crew');
const rest = crew?.actions?.rest as ActionSpec<unknown>;
const sloppy = defineModule({
  ...crew,
  actions: { ...crew?.actions, rest: { run: rest.run, options: () => [{}] } },
} as never);

export { metrics, policies, recordTypes, start } from './salvage-game.ts';
export const modules = salvage.map((m) => (m.id === 'crew' ? sloppy : m));
