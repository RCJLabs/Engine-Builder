import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';
import { backgroundOf, heatOf, pursuerOf, type Read, rulesOf, stepped } from './shared';

interface Foe {
  actor: string;
  count?: number;
}

/** A job on the board, rolled as the board is (the original's contracts.js). */
interface Job {
  contract: string;
  client: string;
  site: string;
  twist?: string;
  pay: number;
  part?: string;
  foes: Foe[];
}

interface Board {
  jobs: Job[];
  /** Jobs done that only come once. */
  spent: string[];
  /** The pursuer's hunters, who join every job from huntHeat: set as the board is opened. */
  hunters: string[];
}

interface Contract {
  title: string;
  mission: string;
  pitch: string;
  clients: string[];
  sites: string[];
  encounter: string;
  against?: string;
  pay: { min: number; max: number };
  drops?: { chance: number; parts: Record<string, number> };
  once?: boolean;
  quest?: string;
  crates?: number;
  turns?: number;
}
interface Named {
  name: string;
  title?: string;
  side?: string;
  district?: string;
  text?: string;
}
interface Twist extends Named {
  enemies?: number;
  pay?: number;
  loud?: boolean;
  missions?: string[];
}
interface Mission extends Named {
  brief: string;
  loud?: boolean;
  breaks: number;
}

type Ctx = ModuleContext<Board>;
type Store = Ctx['content'];
const reader =
  (ctx: Ctx): Read =>
  (id, args) =>
    ctx.fact(id, args);

const spread = (foes: readonly Foe[]) => foes.flatMap((foe) => Array.from({ length: foe.count ?? 1 }, () => foe.actor));
const gather = (actors: readonly string[]) => {
  const foes: Foe[] = [];
  for (const actor of actors) {
    const last = foes.at(-1);
    if (last && last.actor === actor) last.count = (last.count ?? 1) + 1;
    else foes.push({ actor });
  }
  return foes;
};

/** A job's words filled in: "{client} wants them gone." */
const filled = (text: string, words: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => words[key] ?? all);

function rollJob(ctx: Ctx, id: string, district: string): Job {
  const rng = ctx.rng('board');
  const { content } = ctx;
  const rules = rulesOf(content);
  const contract = content.getOrThrow<Contract>('contract', id);
  const local = contract.clients.filter((c) => content.getOrThrow<Named>('client', c).district === district);
  const client = rng.pick(local.length > 0 ? local : contract.clients);
  const site = rng.pick(contract.sites);
  const twists = content.ids('twist').filter((t) => {
    const missions = content.getOrThrow<Twist>('twist', t).missions;
    return missions === undefined || missions.includes(contract.mission);
  });
  const twist = twists.length > 0 && rng.chance(rules['twist-chance'], 100) ? rng.pick(twists) : undefined;
  const twisted = twist ? content.getOrThrow<Twist>('twist', twist) : undefined;
  let pay = 5 * rng.int(Math.ceil(contract.pay.min / 5), Math.floor(contract.pay.max / 5));
  if (twisted?.pay) pay = stepped((pay * (100 + twisted.pay)) / 100);
  // A friendly or trusted client's side pays more.
  const side = content.getOrThrow<Named>('client', client).side;
  const band = side ? ctx.fact('factions.band', { faction: side }) : undefined;
  const bonus = band === 'trusted' ? rules['trusted-pay'] : band === 'friendly' ? rules['friendly-pay'] : 0;
  if (bonus > 0) pay = stepped((pay * (100 + bonus)) / 100);
  const drops = contract.drops;
  let part: string | undefined;
  if (drops && rng.chance(drops.chance, 100)) {
    const parts = Object.keys(drops.parts);
    part = parts[rng.weightedIndex(parts.map((p) => drops.parts[p] as number))];
  }
  const actors = spread(content.getOrThrow<{ foes: Foe[] }>('encounter', contract.encounter).foes);
  for (let n = twisted?.enemies ?? 0; n > 0; n--) actors.push(rng.pick(actors));
  for (let n = twisted?.enemies ?? 0; n < 0 && actors.length > 1; n++) actors.splice(rng.int(0, actors.length - 1), 1);
  return {
    contract: id,
    client,
    site,
    ...(twist ? { twist } : {}),
    pay,
    ...(part ? { part } : {}),
    foes: gather(actors),
  };
}

/**
 * The board: the district's jobs, a quest's job first while its quest waits on it, then the rest
 * shuffled, up to the board's size. A once-job won never comes back.
 */
function rollBoard(ctx: Ctx) {
  const background = backgroundOf(ctx.content, reader(ctx));
  if (!background) return;
  const { content } = ctx;
  const spent = ctx.read().spent;
  const ours = content.ids('contract').filter((id) => {
    const contract = content.getOrThrow<Contract>('contract', id);
    if (!contract.clients.some((c) => content.getOrThrow<Named>('client', c).district === background.district))
      return false;
    if (contract.once && spent.includes(id)) return false;
    if (contract.quest === undefined) return true;
    return (
      ctx.fact('quests.state', { quest: contract.quest }) === 'active' &&
      ctx.fact('quests.stage', { quest: contract.quest }) === id
    );
  });
  const quests = ours.filter((id) => content.getOrThrow<Contract>('contract', id).quest !== undefined);
  const rest = ctx.rng('board').shuffle(ours.filter((id) => !quests.includes(id)));
  const chosen = [...quests, ...rest].slice(0, rulesOf(content)['board-size']);
  ctx.write().jobs = chosen.map((id) => rollJob(ctx, id, background.district));
}

/** After a job: a won one counts for its quest, the day passes (the shop restocks) and the board is rolled again. */
function afterJob(ctx: Ctx, slot: number, result: string) {
  const job = ctx.read().jobs[slot];
  if (!job) return;
  if (result === 'win') {
    ctx.emit('won', { job: job.contract });
    if (ctx.content.getOrThrow<Contract>('contract', job.contract).once) ctx.write().spent.push(job.contract);
  }
  ctx.apply({ effect: 'wait', days: 1 });
  rollBoard(ctx);
}

const nameOf = (content: Store, type: string, id: string) => content.getOrThrow<Named>(type, id).name;

/** A job's fight: its foes, the pursuer's hunters from huntHeat, and what winning and losing move. */
function encounterOf(content: Store, board: Board, job: Job) {
  const rules = rulesOf(content);
  const contract = content.getOrThrow<Contract>('contract', job.contract);
  const mission = content.getOrThrow<Mission>('mission', contract.mission);
  const twist = job.twist ? content.getOrThrow<Twist>('twist', job.twist) : undefined;
  const loud = mission.loud === true || twist?.loud === true;
  const heat = { effect: 'add-to-flag', flag: 'heat', by: loud ? rules['loud-job-heat'] : rules['job-heat'] };
  const side = content.getOrThrow<Named>('client', job.client).side;
  const against = contract.against
    ? [{ effect: 'change-standing', faction: contract.against, by: -rules['lost-standing'] }]
    : [];
  const lost = [heat, ...against];
  return {
    name: contract.title,
    description: `At ${nameOf(content, 'site', job.site)}, for ${nameOf(content, 'client', job.client)}.`,
    combat: 'boarding',
    foes: [...job.foes, ...board.hunters.map((actor) => ({ actor }))],
    breaks: mission.breaks,
    win: [
      { effect: 'add-resource', resource: 'credits', by: job.pay },
      ...(job.part ? [{ effect: 'give-item', item: job.part }] : []),
      heat,
      ...(side ? [{ effect: 'change-standing', faction: side, by: rules['job-standing'] }] : []),
      ...(contract.against
        ? [{ effect: 'change-standing', faction: contract.against, by: -rules['job-standing'] }]
        : []),
    ],
    draw: lost,
    lose: lost,
  };
}

/** The board as an event: each job a choice whose fight's odds, pay and heat show before it is taken. */
function eventOf(content: Store, board: Board) {
  const lines = board.jobs.map((job) => {
    const contract = content.getOrThrow<Contract>('contract', job.contract);
    const words = {
      client: nameOf(content, 'client', job.client),
      site: nameOf(content, 'site', job.site),
      crates: `${contract.crates ?? 1} crate${contract.crates === 1 ? '' : 's'}`,
      turns: `${contract.turns ?? 1} turns`,
    };
    const twist = job.twist ? content.getOrThrow<Twist>('twist', job.twist) : undefined;
    const part = job.part ? ` and a ${nameOf(content, 'item', job.part).toLowerCase()}` : '';
    const twisted = twist ? ` ${twist.name}: ${twist.text}` : '';
    return `${contract.title}: ${filled(contract.pitch, words)} Pays ${job.pay} credits${part}.${twisted}`;
  });
  return {
    name: 'The job board',
    text: lines.join('\n\n'),
    'show-odds': true,
    choices: [
      ...board.jobs.map((job, i) => ({
        id: `job-${i + 1}`,
        label: `${nameOf(content, 'contract', job.contract)} for ${nameOf(content, 'client', job.client)}`,
        effects: [{ effect: 'fight', encounter: `job-${i + 1}` }],
      })),
      { id: 'pass', label: 'Not today', result: 'The board will be there tomorrow.' },
    ],
  };
}

/**
 * Act 1's job board (the original's contracts.js). Its event and each job's encounter are made
 * records (D44), worked out from this slice, so the odds a choice shows are the fight rolled.
 */
export const board: Module = defineModule<Board>({
  id: 'board',
  init: () => ({ jobs: [], spent: [], hunters: [] }),
  effects: {
    'open-board': (ctx) => {
      const hunted = heatOf(reader(ctx)) >= rulesOf(ctx.content)['hunt-heat'];
      ctx.write().hunters = hunted ? [...(pursuerOf(ctx.content, reader(ctx))?.hunters ?? [])] : [];
      if (ctx.read().jobs.length === 0) rollBoard(ctx);
      ctx.apply({ effect: 'open-event', event: 'board' });
    },
  },
  made: {
    types: ['event', 'encounter'],
    ids: ({ state }, type) => {
      if (state.jobs.length === 0) return [];
      return type === 'event' ? ['board'] : state.jobs.map((_, i) => `job-${i + 1}`);
    },
    get: ({ state, content }, type, id) => {
      if (type === 'event' && id === 'board' && state.jobs.length > 0) return eventOf(content, state as Board);
      const slot = type === 'encounter' ? /^job-(\d+)$/.exec(id) : null;
      const job = slot ? state.jobs[Number(slot[1]) - 1] : undefined;
      return job ? encounterOf(content, state as Board, job as Job) : undefined;
    },
  },
  on: {
    'campaign/began': (ctx) => rollBoard(ctx),
    'encounters/fought': (ctx, event) => {
      const slot = /^job-(\d+)$/.exec(String(event.encounter));
      if (slot) afterJob(ctx, Number(slot[1]) - 1, String(event.result));
    },
  },
  facts: {
    jobs: { domain: { type: 'int', min: 0 }, label: 'jobs on the board', read: ({ state }) => state.jobs.length },
    hunted: {
      domain: { type: 'bool' },
      label: 'the hunters join every job',
      read: ({ state }) => state.hunters.length > 0,
    },
  },
  events: {
    won: { args: { job: { type: 'ref', to: 'contract' } }, label: 'A job is won' },
  },
});
