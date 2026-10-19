/**
 * The engine's API in words, for the editor's completion (D38: a list, not TypeScript's language
 * service): each name `import … from 'eb'` gives, and what a handler's `ctx` and an rng stream
 * offer. A test holds the first list to EB_MODULE, so completion never offers a name a script
 * can't import, nor misses one it can.
 */

export interface ApiEntry {
  readonly name: string;
  /** A function to call, or a value to use as it is. */
  readonly kind: 'function' | 'value';
  /** Its signature, shown beside the name. */
  readonly detail: string;
  /** What it is for, in a sentence. */
  readonly info: string;
}

const fn = (name: string, detail: string, info: string): ApiEntry => ({ name, kind: 'function', detail, info });
const value = (name: string, detail: string, info: string): ApiEntry => ({ name, kind: 'value', detail, info });

/** What `import { … } from 'eb'` gives, in EB_MODULE's order. */
export const EB_API: readonly ApiEntry[] = [
  fn(
    'defineModule',
    '({ id, init, actions?, facts?, effects?, events?, on?, modes? }) => Module',
    'A module: one slice of the state, and the actions, facts, effects, events and modes that work on it.',
  ),
  value(
    'engineModules',
    'Module[]',
    'The engine’s logic, flag and sheet modules. A game gets them first unless it lists one itself.',
  ),
  value('logicModule', 'Module', 'The engine’s roll effect: outcomes by whole-percent chance.'),
  value('flagModule', 'Module', 'The project’s flags: the flag.on and flag.number facts, set-flag and add-to-flag.'),
  value('sheetModule', 'Module', 'The trigger sheets: runs their rows when their events are raised.'),
  fn('timeModule', '({ calendar, realTime?, timers? }) => Module', 'A clock read through a calendar, with timers.'),
  value('randomPolicy', 'Policy', 'A bot that takes any offered action at random. Run uses it when a game has none.'),
  fn(
    'weightedPolicy',
    '(name: string, weights: Record<string, number>) => Policy',
    'A bot that weighs offered actions by type, like { "hold/loot": 3 }; a type not named weighs 1.',
  ),
  fn(
    'rulePolicy',
    '(name: string, rules: { when?: Condition; prefer: { type: string } }[]) => Policy',
    'A bot that tries rules in order: the first whose condition holds and which matches an offer picks.',
  ),
  fn('turnFor', '(game, sim, state, rng, turn?) => Turn', 'What a bot sees on a turn: the offers, the mode, facts.'),
  fn('isRecordId', '(text: string) => boolean', 'Whether text is a record id: lowercase words joined by hyphens.'),
  fn('parseRef', '(text: string) => { type: string; id: string } | null', 'A "type:id" reference, read.'),
  fn('formatRef', '(type: string, id: string) => string', 'A reference, written as "type:id".'),
  fn('calendarOf', '(def: CalendarDef) => Calendar', 'A calendar: ticks per day, units, months, seasons.'),
  fn('dateAt', '(calendar: Calendar, tick: number) => CalendarDate', 'The date a tick falls on.'),
  fn('ticksOf', '(calendar: Calendar, duration: { days?: number; … }) => number', 'A length of time in ticks.'),
];

/** What a handler's `ctx` offers: an action's, an effect's or a listener's (ModuleContext). */
export const CTX_API: readonly ApiEntry[] = [
  fn('read', '() => State', 'This module’s slice, with this action’s changes so far.'),
  fn('write', '() => State', 'This module’s slice, to change. Kept only if the action is accepted.'),
  fn(
    'rng',
    '(name: string) => Rng',
    'This module’s random stream with this name: the only randomness a handler may use.',
  ),
  fn('emit', '(what: string, data?: object) => void', 'Raises "module/what": an event, when the module declares it.'),
  fn('refuse', '(reason: string, data?: object) => never', 'Refuses the action: nothing it changed is kept.'),
  fn('fact', '(id: string, args?: object) => unknown', 'A fact’s value, read through this action’s changes.'),
  fn(
    'check',
    '(condition: Condition) => true | false | null',
    'A condition’s truth, read through this action’s changes.',
  ),
  fn('apply', '(effect: Effect) => void', 'Applies an effect, as content’s rows do: { effect: "stash" }.'),
  fn('attempt', '(work: () => void) => Attempt', 'Runs work; if anything in it refuses, all of it is undone.'),
  value('modes', 'ModeControl', 'The mode stack: push, pop, replace, current.'),
  value('content', 'RecordStore', 'The project’s records: get, require, ids, entries.'),
  value('module', 'string', 'This module’s id.'),
  value('step', 'number', 'The step this action becomes if it is accepted.'),
];

/** The parts of the definition defineModule takes (ModuleDef), for completion inside its braces. */
export const MODULE_API: readonly ApiEntry[] = [
  value('id', 'string', 'The module’s id, kebab-case: its actions are "id/verb", its facts "id.name".'),
  fn('init', '(ctx: { content, rng }) => State', 'The slice a new game starts with.'),
  fn('start', '(ctx) => void', 'Runs once as a new game begins, after every init: what init can’t, such as effects.'),
  value('actions', '{ verb: (ctx, action) => void }', 'What the player can do: each a handler, or { run, options }.'),
  value(
    'facts',
    '{ name: { read, domain?, label? } }',
    'What content can read: each read from the slice, never changing it.',
  ),
  value('effects', '{ name: (ctx, effect) => void }', 'What content can do: { "effect": "name" } in a row or a roll.'),
  value('events', '{ name: { args?, label? } }', 'The beats trigger rows can react to, raised with ctx.emit.'),
  value('on', '{ "module/event": (ctx, event) => void }', 'What the module does when an event is raised.'),
  value('modes', '{ name: { actions: ["id/*"] } }', 'The modes the game moves through, and the actions each allows.'),
  value(
    'made',
    '{ types: string[], ids(view, type), get(view, type, id) }',
    'Records it makes in play from its slice, which every module reads beside the pack’s.',
  ),
  value(
    'version',
    'number',
    'The slice’s shape, from 1: bump it with a migration and an old save that must still load.',
  ),
  value('migrate', '{ 2: (slice) => slice }', 'Migrations by the version they make.'),
];

/** What an rng stream offers (Rng). */
export const RNG_API: readonly ApiEntry[] = [
  fn('int', '(min: number, max: number) => number', 'A whole number from min to max, both included.'),
  fn('chance', '(num: number, den: number) => boolean', 'True num times in den.'),
  fn('pick', '<T>(items: T[]) => T', 'One of the items, each as likely.'),
  fn('weightedIndex', '(weights: number[]) => number', 'An index, as likely as its whole-number weight.'),
  fn('shuffle', '<T>(items: T[]) => T[]', 'The items in a new order.'),
  fn('fork', '(label: string | number) => Rng', 'A stream of its own that never shifts this one.'),
];
