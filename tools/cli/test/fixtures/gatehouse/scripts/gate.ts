import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

interface Gate {
  day: number;
  judged: number;
}

// Three souls a day at the desk, and three days: a dusk scene closes each.
const SOULS = 3;
const LAST_DAY = 3;

// Odin's hall pays a ring for every hero sent up the hill.
function judge(ctx: ModuleContext<Gate>, hall: unknown): void {
  ctx.apply({ effect: 'change-standing', faction: hall, by: 1 });
  if (hall === 'odin') ctx.apply({ effect: 'add-resource', resource: 'rings', by: 1 });
  ctx.write().judged += 1;
  if (ctx.read().judged < SOULS) return;
  const { day } = ctx.read();
  ctx.write().judged = 0;
  ctx.write().day = day + 1;
  ctx.emit('dusk', { day });
}

/**
 * Chooser of the Slain's gate, cut down: three souls a day to send up the hill to Odin's hall or
 * down to the bridge and Hel's, and at each dusk a scene, which the sheet opens and an ink file
 * writes. The scenes say who comes and what they ask; the game only keeps the days.
 */
export const gate: Module = defineModule<Gate>({
  id: 'gate',
  init: () => ({ day: 1, judged: 0 }),
  actions: {
    judge: {
      run: (ctx, action) => judge(ctx, action.hall),
      options: ({ state }) => (state.day <= LAST_DAY ? [{ hall: 'odin' }, { hall: 'hel' }] : []),
    },
  },
  facts: {
    day: { read: ({ state }) => state.day, domain: { type: 'int', min: 1 }, label: 'the day' },
  },
  events: {
    dusk: { args: { day: { type: 'int', min: 1 } }, label: 'A day at the gate ends' },
  },
  modes: {
    desk: { actions: ['gate/judge'] },
  },
});
