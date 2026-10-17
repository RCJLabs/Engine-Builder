/**
 * Bot policies (docs/specs/runner.md). A policy picks one of the actions the game offers, or
 * stops. It sees what a player sees through the game's options and facts, and draws from a
 * stream of its own, so it can neither make a move a player couldn't nor peek at the game's dice.
 */
import type { Condition } from '../logic/types.ts';
import type { Rng } from '../rng.ts';
import type { Game } from '../sim/game.ts';
import { matches } from '../sim/registry.ts';
import type { Action, GameState, SimContext } from '../sim/types.ts';

/** What a policy sees when it is its turn to choose. */
export interface Turn {
  readonly state: GameState;
  /** What the game offers now, from `game.options`. Never empty: a run ends when nothing is offered. */
  readonly options: readonly Action[];
  /** The bot's own stream, forked from the run's seed as "bot": its draws never shift the game's. */
  readonly rng: Rng;
  readonly game: Game;
  readonly sim: SimContext;
  /** Turns taken before this one. */
  readonly turn: number;
}

export interface Policy {
  /** Kebab-case, for reports and golden files. */
  readonly name: string;
  /** One of `turn.options`, the object itself, or null to stop the run. */
  choose(turn: Turn): Action | null;
}

/** Any offered action, each as likely as the next. */
export const randomPolicy: Policy = { name: 'random', choose: ({ options, rng }) => rng.pick(options) };

/**
 * Offered actions weighed by type: `{ 'crew/rest': 1, 'voyage/jump': 2 }`, and 1 for a type not
 * named. A weight is a whole number; 0 never picks the type, and when every offer weighs 0 the
 * bot stops.
 */
export function weightedPolicy(name: string, weights: Readonly<Record<string, number>>): Policy {
  for (const [type, weight] of Object.entries(weights)) {
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(`weightedPolicy(): the weight of "${type}" must be a whole number, at least 0`);
    }
  }
  return {
    name,
    choose({ options, rng }) {
      const each = options.map((option) => weights[option.type] ?? 1);
      return each.some((w) => w > 0) ? (options[rng.weightedIndex(each)] as Action) : null;
    },
  };
}

/** A rule of a rule policy: while `when` holds, prefer the options that match `prefer`. */
export interface PolicyRule {
  readonly when?: Condition;
  /**
   * The fields an option must have: `{ type: 'voyage/choose', choice: 'pay' }`. The type may be
   * a mode pattern, such as `crew/*`.
   */
  readonly prefer: Readonly<Record<string, unknown>> & { readonly type: string };
}

/**
 * Rules tried in order, as data like any content: the first rule whose condition holds and
 * which matches an offered action picks among its matches at random. With no rule matching, any
 * offered action. Conditions read the game through `game.check`, as a menu does.
 */
export function rulePolicy(name: string, rules: readonly PolicyRule[]): Policy {
  return {
    name,
    choose({ state, options, rng, game, sim }) {
      for (const rule of rules) {
        if (rule.when !== undefined && game.check(state, rule.when, sim) !== true) continue;
        const matching = options.filter((option) => fits(option, rule.prefer));
        if (matching.length > 0) return rng.pick(matching);
      }
      return rng.pick(options);
    },
  };
}

function fits(option: Action, prefer: PolicyRule['prefer']): boolean {
  return Object.entries(prefer).every(([key, value]) =>
    key === 'type' ? matches(value as string, option.type) : option[key] === value,
  );
}
