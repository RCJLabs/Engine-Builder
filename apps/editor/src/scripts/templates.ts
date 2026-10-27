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

/**
 * A new stage (M7.4, D86): it draws the space plainly, so it plays at once and shows the API's every
 * part: the tilemap as squares, or the objects as boxes; the walkers as dots; each use outlined, where
 * the page puts its button; a drag to move the view. Sound by the stage rules as it stands.
 */
export const stageTemplate = (
  id: string,
): string => `// stages/${id}.ts: draws a 2D space each frame on its canvas, in CSS pixels. Name it as a space's
// Stage, in the inspector with nothing chosen in the space, and Play draws the space with it.
import { defineStage, type Start } from 'eb/stage';

interface Tiles {
  at: [number, number];
  tile: [number, number];
  size: [number, number];
  cells: string[];
}

let space: Start;
let pan = [0, 0];

export default defineStage({
  start(s) {
    space = s;
  },
  frame(g, f) {
    for (const event of f.input) if (event.kind === 'drag') pan = [pan[0] + event.dx, pan[1] + event.dy];
    // The space fitted to the box, y up as the space has it.
    const [w, h] = space.size;
    const k = Math.min(f.w / w, f.h / h);
    const at = (x: number, y: number) => [(f.w - w * k) / 2 + pan[0] + x * k, (f.h + h * k) / 2 + pan[1] - y * k];
    g.fillStyle = '#10131c';
    g.fillRect(0, 0, f.w, f.h);

    const tiles = space.world.tiles as Tiles | undefined;
    if (tiles) {
      // A cell's rules are a hexadecimal digit: 1 is walkable.
      tiles.cells.forEach((row, r) => {
        [...row].forEach((rule, c) => {
          g.fillStyle = parseInt(rule, 16) & 1 ? '#3b4258' : '#1c2030';
          const [x, y] = at(tiles.at[0] + c * tiles.tile[0], tiles.at[1] + (tiles.size[1] - r) * tiles.tile[1]);
          g.fillRect(x, y, tiles.tile[0] * k - 1, tiles.tile[1] * k - 1);
        });
      });
    } else {
      g.fillStyle = '#3b4258';
      for (const [x, y] of Object.values(space.places)) {
        const [sx, sy] = at(x, y);
        g.fillRect(sx - 4, sy - 8, 8, 8);
      }
    }

    g.fillStyle = '#f2c14e';
    for (const walker of f.walkers) {
      const [x, y] = at(walker.at[0], walker.at[1]);
      g.beginPath();
      g.arc(x, y - 4, 4, 0, Math.PI * 2);
      g.fill();
    }

    // Each use outlined; the page puts its button over the box returned.
    const uses = Object.keys(space.world.uses)
      .filter((object) => !f.taken.includes(object) && space.places[object])
      .map((object) => {
        const [x, y] = at(...space.places[object]);
        return { object, box: [x - 12, y - 24, 24, 24] as [number, number, number, number] };
      });
    g.strokeStyle = '#7cc4ff';
    for (const use of uses) g.strokeRect(...use.box);
    return { uses };
  },
});
`;
