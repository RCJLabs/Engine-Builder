/**
 * The scripts the editor writes to start from (M3.2): sound as they stand, so a game started here
 * runs, checks and plays at once, each part labelled with what it is for. A test holds them to
 * that: they load, Run plays them, and no bot's offer is refused.
 */
import { GAME_SCRIPT, scriptPath } from '@eb/script';

// Names JavaScript keeps for itself, which a module named "new" or "class" can't take as they are.
const RESERVED = new Set(
  (
    'await break case catch class const continue debugger default delete do else enum export extends false ' +
    'finally for function if implements import in instanceof interface let new null package private ' +
    'protected public return static super switch this throw true try typeof var void while with yield'
  ).split(' '),
);

/**
 * A module's name in code: "crew-quarters" is crewQuarters. One that would start with a digit gets
 * an "m" before it, and a word JavaScript keeps, "Module" after it.
 */
export function moduleName(id: string): string {
  const name = id.replace(/-([a-z0-9])/g, (_, next: string) => next.toUpperCase());
  if (/^[0-9]/.test(name)) return `m${name}`;
  return RESERVED.has(name) ? `${name}Module` : name;
}

/** scripts/game.ts for a game of one module, `first`. */
export const gameTemplate = (
  first: string,
): string => `// The game: the modules it is made of, the mode a new game starts in, the bots that play it
// (Run, and eb sim --policy), and the facts their reports follow. eb validate and eb sim read
// these exports as they read a --game module.
import { weightedPolicy } from 'eb';
import { ${moduleName(first)} } from './${first}';

export const modules = [${moduleName(first)}];
export const start = 'play';
export const policies = [weightedPolicy('worker', { '${first}/work': 3, '${first}/rest': 1 })];
export const metrics = ['${first}.coins'];
`;

/** The first module: a slice of state, two actions, an event, facts and the modes the game moves through. */
export const firstModuleTemplate = (id: string): string => `import { defineModule } from 'eb';

interface State {
  day: number;
  coins: number;
}

/** Ten days to work or rest. Work pays from 1 to 3 coins. */
export const ${moduleName(id)} = defineModule<State>({
  id: '${id}',
  init: () => ({ day: 1, coins: 0 }),
  actions: {
    work(ctx) {
      // Randomness only from ctx.rng: the same seed plays the same game everywhere.
      ctx.write().coins = ctx.read().coins + ctx.rng('pay').int(1, 3);
      ctx.apply({ effect: 'end-day' });
    },
    rest(ctx) {
      ctx.apply({ effect: 'end-day' });
    },
  },
  effects: {
    'end-day'(ctx) {
      const day = ctx.read().day;
      // Raised as ${id}/day-ended: a trigger sheet's row can react to it.
      ctx.emit('day-ended', { day });
      if (day >= 10) ctx.modes.replace('done');
      else ctx.write().day = day + 1;
    },
  },
  events: {
    'day-ended': { args: { day: { type: 'int', min: 1, max: 10 } }, label: 'A day ends' },
  },
  facts: {
    day: { read: ({ state }) => state.day, domain: { type: 'int', min: 1, max: 10 }, label: 'the day' },
    coins: { read: ({ state }) => state.coins, domain: { type: 'int', min: 0 }, label: 'coins saved' },
  },
  modes: { play: { actions: ['${id}/*'] }, done: { actions: [] } },
});
`;

/** Another module: its own slice and a fact, for game.ts to list once it does something. */
export const moduleTemplate = (id: string): string => `import { defineModule } from 'eb';

interface State {
  count: number;
}

// Not part of the game until game.ts lists it in modules.
export const ${moduleName(id)} = defineModule<State>({
  id: '${id}',
  init: () => ({ count: 0 }),
  facts: {
    count: { read: ({ state }) => state.count, domain: { type: 'int', min: 0 }, label: '${id} count' },
  },
});
`;

/**
 * What starting a game writes: game.ts, and its first module as "main", or "main-2"… when a
 * script has that name already. Paths and texts, in the order they are made.
 */
export function startFiles(ids: readonly string[]): [path: string, text: string][] {
  let first = 'main';
  for (let n = 2; ids.includes(first); n++) first = `main-${n}`;
  return [
    [scriptPath(GAME_SCRIPT), gameTemplate(first)],
    [scriptPath(first), firstModuleTemplate(first)],
  ];
}
