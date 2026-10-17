/**
 * Bot policies (docs/specs/runner.md). A policy picks one of the actions the game offers, or
 * stops. It sees what a player sees, the options, the screen and the facts, and draws from a
 * stream of its own. So it can't make a move a player couldn't, read state a player can't see,
 * or look ahead at the game's dice: sandbagged's bot read the hidden grip on 72.2% of its
 * decisions, and ludus's probes spent the game's own rolls.
 */
import type { Condition, Truth } from '../logic/types.ts';
import { isRecordId, type RecordStore } from '../records.ts';
import type { Rng } from '../rng.ts';
import type { Game } from '../sim/game.ts';
import type { FactArgs } from '../sim/module.ts';
import { matches } from '../sim/registry.ts';
import type { Action, Effect, EffectPreview, GameState, ModeFrame, SimContext } from '../sim/types.ts';

/** What a policy sees when it is its turn to choose. */
export interface Turn {
  /** What the game offers now, from `game.options`. Never empty: a run ends when nothing is offered. */
  readonly options: readonly Action[];
  /** The current mode, with its data: the screen the player is on. */
  readonly mode: ModeFrame;
  readonly content: RecordStore;
  /** A fact of the current state, as a menu reads it. */
  fact(id: string, args?: FactArgs): unknown;
  /** A condition's truth in the current state, as a menu checks it. */
  check(condition: Condition): Truth;
  /** What effects would do now: the odds and costs a player is shown, never the outcome. */
  preview(effects: readonly Effect[]): readonly EffectPreview[];
  /** The bot's own stream, forked from the run's seed as "bot": its draws never shift the game's. */
  readonly rng: Rng;
  /** Turns taken before this one. */
  readonly turn: number;
}

/** The turn a policy gets in `state`: what playRun hands it, for tests and for a "suggest a move" button. */
export function turnFor(game: Game, sim: SimContext, state: GameState, rng: Rng, turn = 0): Turn {
  return {
    options: game.options(state, sim),
    mode: state.kernel.modes[state.kernel.modes.length - 1] as ModeFrame,
    content: sim.content,
    fact: (id, args) => game.fact(state, id, args, sim),
    check: (condition) => game.check(state, condition, sim),
    preview: (effects) => game.preview(state, effects, sim),
    rng,
    turn,
  };
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
  checkName(name);
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
 * offered action. Conditions are checked as a menu checks them.
 */
export function rulePolicy(name: string, rules: readonly PolicyRule[]): Policy {
  checkName(name);
  return {
    name,
    choose({ options, rng, check }) {
      for (const rule of rules) {
        if (rule.when !== undefined && check(rule.when) !== true) continue;
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

// Golden files and reports name the policy, and a golden file only reads kebab-case names.
function checkName(name: string): void {
  if (!isRecordId(name)) throw new RangeError(`"${name}" is not a policy name: use kebab-case, like "steady"`);
}
