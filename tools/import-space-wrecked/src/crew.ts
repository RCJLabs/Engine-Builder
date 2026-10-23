/**
 * The crew: the stats a fight reads, the jobs as actors, the traits as statuses, the companions,
 * and the recruit templates the roster rolls the start crew and the stations' recruits from.
 */
import { defined, type RecordSet } from './records.ts';
import type { Fighter, Source } from './source.ts';

/** The stats the crew and their foes have, as Space-Wrecked's jobs and enemies list them. */
const CREW_STATS = {
  hp: { name: 'HP', description: 'Hit points: what a hit takes off. Someone left with none falls.' },
  aim: { name: 'Aim', description: 'The chance to hit, in percent, before the target’s defense', min: -100 },
  defense: { name: 'Defense', description: 'Taken off the aim of anyone shooting at them', min: -100 },
  mobility: { name: 'Mobility', description: 'Tiles a move covers: the tactical fight’s, kept for the record' },
  armor: { name: 'Armor', description: 'Taken off each hit they take, which takes off at least 1' },
  damage: { name: 'Damage', description: 'What each hit takes off: their weapon’s mean, rounded' },
  fights: { name: 'Fights', description: 'Fights stood in: rank 1 comes at 3, rank 2 at 8' },
} as const;

/** A weapon's damage as one number, since a fight here rolls hits, not damage: its mean, rounded. */
export function weaponDamage(source: Source, weapon: string): number {
  const found = source.weapons.weapons.find((w) => w.id === weapon);
  if (!found) throw new Error(`No weapon ${weapon}`);
  return Math.round((found.damage[0] + found.damage[1]) / 2);
}

/** A fighter's stats, as the stats kit holds them. */
export function fighterStats(source: Source, fighter: Fighter): Record<string, number> {
  const { hp, aim, defense, mobility, armor } = fighter;
  return { hp, aim, defense, mobility, armor, damage: weaponDamage(source, fighter.weapon) };
}

const weaponName = (source: Source, weapon: string) => source.weapons.weapons.find((w) => w.id === weapon)?.name;

export function importCrew(source: Source, set: RecordSet): void {
  for (const [id, stat] of Object.entries(CREW_STATS)) set.add('stat', id, stat);

  // The jobs: what a crew member is, and what the recruits and the start crew copy.
  for (const job of source.jobs.jobs) {
    const ranks = (job.ranks ?? []).map((rank, i) => `Rank ${i + 1}, ${rank.name}: ${rank.text}`).join(' ');
    set.add(
      'actor',
      job.id,
      defined({
        name: job.name,
        description: ranks || undefined,
        stats: { ...fighterStats(source, job), fights: 0 },
        job: job.id,
        weapon: weaponName(source, job.weapon),
      }),
    );
  }

  for (const trait of source.traits.traits) {
    const modifiers = Object.entries(trait.effects).map(([stat, add]) => ({ stat, add }));
    set.add('status', trait.id, { name: trait.name, description: trait.text, modifiers, tags: ['trait'] });
  }

  for (const companion of source.companions.companions) {
    const job = source.jobs.jobs.find((j) => j.id === companion.job);
    if (!job) throw new Error(`No job ${companion.job}`);
    set.add('actor', companion.id, {
      name: companion.name,
      description: companion.past,
      stats: { ...fighterStats(source, job), fights: companion.fights },
      statuses: [...companion.traits],
      job: job.id,
      weapon: weaponName(source, job.weapon),
    });
  }
  importRecruits(source, set);
}

/**
 * The recruit templates. A background's captain: a name from its list and two traits shuffled
 * from them all (the original lets the player choose both). The start crew's others: a job each,
 * a first and a last name, no traits. The stations' recruits: one for each recruit background and
 * job it lists, its traits shuffled from the background's and exactly its trait count taken.
 */
function importRecruits(source: Source, set: RecordSet): void {
  const { first, last } = source.recruits;
  const allTraits = source.traits.traits.map((t) => ({ status: t.id }));
  for (const background of source.backgrounds.backgrounds) {
    const job = background.start.crew[0] as string;
    set.add('recruit', `captain-${background.id}`, {
      name: `${background.name}, the captain`,
      actor: job,
      names: [...background.captains],
      traits: allTraits,
      most: 2,
      draw: 'shuffle',
    });
  }
  for (const job of source.jobs.jobs) {
    set.add('recruit', `crew-${job.id}`, {
      name: `Start crew, ${job.name.toLowerCase()}`,
      actor: job.id,
      names: [...first],
      bynames: [...last],
    });
  }
  const { recruitFee, recruitTraitFee } = source.balance;
  const offered: { recruit: string; weight: number }[] = [];
  // Each background is as likely as any other, and each of its jobs as likely as the next.
  const share = source.recruits.backgrounds.reduce((all, b) => lcm(all, b.jobs.length), 1);
  for (const background of source.recruits.backgrounds) {
    for (const job of background.jobs) {
      const id = `${background.id}-${job}`;
      const jobName = source.jobs.jobs.find((j) => j.id === job)?.name ?? job;
      set.add(
        'recruit',
        id,
        defined({
          name: `${background.name}, ${jobName.toLowerCase()}`,
          description: background.text,
          actor: job,
          names: [...first],
          bynames: [...last],
          stats: { fights: { min: background.fights[0], max: background.fights[1] } },
          traits:
            background.traits.length > 0
              ? background.traits.map((status) => ({ status, fee: { credits: recruitTraitFee } }))
              : undefined,
          most: background.traits.length > 0 ? background.traitCount : undefined,
          draw: background.traits.length > 0 ? 'shuffle' : undefined,
          fee: { credits: recruitFee },
        }),
      );
      offered.push({ recruit: id, weight: share / background.jobs.length });
    }
  }
  set.add('hall', 'station', {
    name: 'Station bar',
    description: 'Crew looking for a berth, at every station’s bar.',
    offers: source.balance.recruitOffer,
    recruits: offered,
  });
  set.add('roster', 'crew', {
    name: 'The crew',
    description: 'Everyone aboard. Room is the lesser of the berths and the life support.',
    'cap-flag': 'room',
    ranks: {
      stat: 'fights',
      bands: [
        { id: 'green', name: 'Green' },
        { id: 'rank-1', name: 'Rank 1', from: source.balance.rankOneFights },
        { id: 'rank-2', name: 'Rank 2', from: source.balance.rankTwoFights },
      ],
    },
  });
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);
