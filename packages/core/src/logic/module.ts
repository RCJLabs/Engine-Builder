/**
 * The logic module: effects that content uses to branch. A game adds it to its modules to get
 * them. Its slice is empty; its one stream is "logic/roll".
 */
import { defineModule } from '../sim/module.ts';
import type { Effect } from '../sim/types.ts';

export interface RollOutcome {
  /** Whole percent, 1 to 100. A roll's chances add up to 100. */
  readonly chance: number;
  /** For the stage, when the outcome is offered: "The hull holds". */
  readonly text?: string;
  readonly effects: readonly Effect[];
}

/** `{ "effect": "roll", "outcomes": [{ "chance": 70, "effects": [...] }, { "chance": 30, ... }] }` */
export interface RollEffect extends Effect {
  readonly effect: 'roll';
  readonly outcomes: readonly RollOutcome[];
}

export interface RollRow {
  readonly outcome: RollOutcome;
  /** The outcome's place in the list, as the beat reports it. */
  readonly index: number;
  /** The rolls of 1 to 100 that pick it: 70 then 30 is 1–70, then 71–100. */
  readonly from: number;
  readonly to: number;
}

/**
 * Which rolls pick which outcome, in the order written, as Space-Wrecked's events roll. The
 * roll and its preview both read this table, so the odds a player is shown are the odds rolled.
 * Throws on chances that aren't whole percents adding up to 100: the content schema should
 * have stopped them (rollEffect in @eb/schema).
 */
export function rollTable(effect: Effect): readonly RollRow[] {
  const outcomes = (effect as RollEffect).outcomes;
  if (!Array.isArray(outcomes) || outcomes.length === 0) throw new Error('A roll needs a list of outcomes');
  let to = 0;
  const rows = outcomes.map((outcome: RollOutcome, index) => {
    const { chance } = outcome;
    if (!Number.isInteger(chance) || chance < 1)
      throw new Error(`Roll outcome ${index}: chance is a whole percent, at least 1`);
    const from = to + 1;
    to += chance;
    return { outcome, index, from, to };
  });
  if (to !== 100) throw new Error(`A roll's chances add up to 100, not ${to}`);
  return rows;
}

export const logicModule = defineModule<Record<string, never>>({
  id: 'logic',
  init: () => ({}),
  effects: {
    roll: {
      run(ctx, effect) {
        const rows = rollTable(effect);
        // One draw per roll, even with one outcome, so later rolls don't shift when content changes.
        const roll = ctx.rng('roll').int(1, 100);
        const row = rows.find((r) => roll <= r.to) as RollRow;
        ctx.emit('rolled', { roll, outcome: row.index, chance: row.outcome.chance });
        for (const next of row.outcome.effects) ctx.apply(next);
      },
      preview: (ctx, effect) => ({
        outcomes: rollTable(effect).map(({ outcome }) => ({
          chance: outcome.chance,
          ...(outcome.text === undefined ? {} : { text: outcome.text }),
          effects: outcome.effects.map((next) => ctx.preview(next)),
        })),
      }),
    },
  },
});
