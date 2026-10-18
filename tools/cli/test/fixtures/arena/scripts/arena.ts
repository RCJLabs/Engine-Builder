import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

interface Arena {
  wins: Record<string, number>;
  champion: string | null;
}

type Read = (id: string, args?: Record<string, unknown>) => unknown;

// Eight wins crown a champion; a stable with none by day 40 is sold off.
const CROWN = 8;
const LAST_DAY = 40;
const ROUNDS = 12;
// Too hurt to fight below this much vitality.
const FIT = 20;

const value = (fact: Read, actor: string, stat: string) => fact('stats.value', { actor, stat }) as number;
const left = (fact: Read, actor: string) => fact('stats.current', { actor, stat: 'vitality' }) as number;

/** The chance in 100 that `a` lands a blow on `b`: 50, moved by their agility, kept within 15 and 85. */
const hitChance = (fact: Read, a: string, b: string) =>
  Math.min(85, Math.max(15, 50 + value(fact, a, 'agility') - value(fact, b, 'agility')));

/** What a blow takes: 2, and a sixth of the might behind it. */
const blow = (fact: Read, a: string) => 2 + Math.floor(value(fact, a, 'might') / 6);

const pairs = (ids: readonly string[]) => ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as const));

function retireIfLate(ctx: ModuleContext<Arena>): void {
  if ((ctx.fact('time.day') as number) < LAST_DAY || ctx.read().champion !== null) return;
  ctx.modes.replace('retired');
  ctx.emit('retired', {});
}

/** One bout to the end: up to 12 rounds of a blow each way, who has more vitality left winning a draw. */
function fight(ctx: ModuleContext<Arena>, a: string, b: string): { winner: string; loser: string } {
  const fact: Read = (id, args) => ctx.fact(id, args);
  const rng = ctx.rng('bouts');
  let loser: string | null = null;
  for (let round = 0; round < ROUNDS && loser === null; round++) {
    for (const [att, def] of [
      [a, b],
      [b, a],
    ]) {
      if (loser !== null || rng.int(1, 100) > hitChance(fact, att, def)) continue;
      ctx.apply({ effect: 'damage-stat', actor: def, stat: 'vitality', by: blow(fact, att) });
      if (left(fact, def) === 0) loser = def;
    }
  }
  loser ??= left(fact, a) >= left(fact, b) ? b : a;
  return { winner: loser === a ? b : a, loser };
}

/**
 * Ludus's arena, cut down: a lanista's four gladiators fight bouts for the purse, rest, and buy
 * arms at the armoury, until one has eight wins or day 40 comes.
 */
export const arena: Module = defineModule<Arena>({
  id: 'arena',
  init: () => ({ wins: {}, champion: null }),
  actions: {
    bout: {
      run(ctx, action) {
        const a = action.a as string;
        const b = action.b as string;
        const fact: Read = (id, args) => ctx.fact(id, args);
        if (a === b || left(fact, a) <= FIT || left(fact, b) <= FIT) return ctx.refuse('not-fit');
        ctx.apply({ effect: 'wait', days: 1 });
        const { winner, loser } = fight(ctx, a, b);
        ctx.apply({ effect: 'add-status', actor: loser, status: 'bruised' });
        if (ctx.rng('injuries').int(1, 3) === 1)
          ctx.apply({ effect: 'add-status', actor: loser, status: 'cracked-ribs' });
        ctx.apply({ effect: 'roll-loot', table: 'purse' });
        const wins = (ctx.read().wins[winner] ?? 0) + 1;
        ctx.write().wins[winner] = wins;
        // Every third win hardens a fighter for good.
        if (wins % 3 === 0) ctx.apply({ effect: 'add-to-stat', actor: winner, stat: 'might', by: 1 });
        ctx.emit('won', { winner, loser });
        if (wins >= CROWN) {
          ctx.write().champion = winner;
          ctx.modes.replace('triumph');
          ctx.emit('crowned', { champion: winner });
        } else retireIfLate(ctx);
      },
      options: ({ content, fact }) =>
        pairs(content.ids('actor'))
          .filter(([a, b]) => left(fact, a) > FIT && left(fact, b) > FIT)
          .map(([a, b]) => ({ a, b })),
    },
    rest(ctx) {
      ctx.apply({ effect: 'wait', days: 1 });
      for (const actor of ctx.content.ids('actor')) ctx.apply({ effect: 'heal-stat', actor, stat: 'vitality', by: 25 });
      retireIfLate(ctx);
    },
    shop: (ctx) => ctx.apply({ effect: 'open-shop', shop: 'armoury' }),
    arm: {
      run: (ctx, action) => ctx.apply({ effect: 'equip', actor: action.gladiator, item: action.item }),
      options: ({ content, fact }) =>
        content
          .ids('item')
          .filter((item) => (fact('inventory.count', { item }) as number) > 0)
          .flatMap((item) => content.ids('actor').map((gladiator) => ({ gladiator, item }))),
    },
  },
  facts: {
    best: {
      read: ({ state }) => Object.values(state.wins).reduce((most, n) => Math.max(most, n), 0),
      domain: { type: 'int', min: 0 },
      label: 'the most wins',
    },
    ending: {
      read: ({ state }) => (state.champion !== null ? 'champion' : undefined),
      domain: { type: 'enum', values: ['champion'] },
    },
  },
  events: {
    won: {
      args: { winner: { type: 'ref', to: 'actor' }, loser: { type: 'ref', to: 'actor' } },
      label: 'A bout is won',
    },
    crowned: { args: { champion: { type: 'ref', to: 'actor' } }, label: 'A champion is crowned' },
    retired: { args: {}, label: 'The stable is sold' },
  },
  modes: { arena: { actions: ['arena/*'] }, triumph: { actions: [] }, retired: { actions: [] } },
});
