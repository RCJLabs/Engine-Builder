/**
 * A small game as a project's scripts: a hold that loots and stashes, its game.ts, and helpers
 * the tests share. The sources are TypeScript as a person writes it in scripts/.
 */
import { checkScript } from '../src/check.ts';

export const HOLD = `import { defineModule } from 'eb';
import type { Module } from 'eb';

interface Hold { count: number }

/** What the crew carries. */
export const hold: Module = defineModule<Hold>({
  id: 'hold',
  init: () => ({ count: 0 }),
  actions: {
    loot(ctx) {
      const next = ctx.read().count + 1;
      ctx.write().count = next;
      ctx.emit('looted', { count: next });
    },
  },
  events: { looted: { args: { count: { type: 'int', min: 0 } }, label: 'Something is looted' } },
  facts: { count: { read: ({ state }) => state.count, domain: { type: 'int', min: 0 }, label: 'items held' } },
  effects: { stash(ctx) { ctx.write().count += 1; } },
  modes: { play: { actions: ['*'] } },
});
`;

export const GAME = `import { weightedPolicy } from 'eb';
import { hold } from './hold';

export const modules = [hold];
export const start = 'play';
export const policies = [weightedPolicy('greedy', { 'hold/loot': 3 })];
export const metrics = ['hold.count'];
`;

/** Each source checked, as the compiler checks them, and its JavaScript by id. */
export function compiled(sources: Readonly<Record<string, string>>): Map<string, string> {
  const ids = new Set(Object.keys(sources));
  const out = new Map<string, string>();
  for (const [id, source] of Object.entries(sources)) {
    const checked = checkScript(source, ids);
    if (checked.problems.length > 0 || checked.js === undefined) {
      throw new Error(`${id}: ${checked.problems.map((p) => `${p.code} ${p.line}: ${p.message}`).join('; ')}`);
    }
    out.set(id, checked.js);
  }
  return out;
}
