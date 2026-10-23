/**
 * Act 1's board and who it is for: the missions and twists, the contracts, the districts with
 * their clients and sites, and the backgrounds a campaign starts from. These are the project's
 * own types (types/), which the board and campaign scripts read.
 */
import { defined, idOf, type RecordSet } from './records.ts';
import type { Source } from './source.ts';

/**
 * The rebuild's own tuning, not the original's data: the share of their health the foes lose
 * before a job is done. A clear fights to the last; a grab or a hack is over once the crew holds
 * the ground long enough, which the original's tactical fight decides and this one can't. Set
 * against the original's measured win rates (docs/specs/space-wrecked.md, Readings).
 */
export const BREAKS: Readonly<Record<string, number>> = { clear: 100, grab: 60, hack: 50 };

/** A text's {words} filled from a twist's own numbers: "Nobody sees past {sight} tiles." */
const filled = (text: string, values: Readonly<Record<string, unknown>>) =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => (values[key] === undefined ? all : String(values[key])));

export function importBoard(source: Source, set: RecordSet): void {
  const { contracts } = source;
  for (const mission of contracts.missions) {
    const breaks = BREAKS[mission.id];
    if (breaks === undefined) throw new Error(`No tuning for mission ${mission.id}`);
    set.add('mission', mission.id, defined({ name: mission.name, brief: mission.brief, loud: mission.loud, breaks }));
  }
  for (const twist of contracts.twists) {
    set.add(
      'twist',
      twist.id,
      defined({
        name: twist.name,
        text: filled(twist.text, twist as unknown as Record<string, unknown>),
        enemies: twist.enemies,
        pay: twist.pay,
        loud: twist.loud,
        missions: twist.missions ? [...twist.missions] : undefined,
      }),
    );
  }
  for (const job of contracts.jobs) {
    set.add(
      'contract',
      job.id,
      defined({
        title: job.title,
        mission: job.mission,
        pitch: job.pitch,
        clients: [...job.clients],
        sites: [...job.sites],
        encounter: job.encounter,
        against: job.against,
        pay: { min: job.credits[0], max: job.credits[1] },
        drops: job.drops ? { chance: job.drops.chance, parts: { ...job.drops.parts } } : undefined,
        once: job.once,
        quest: job.quest,
        crates: job.crates,
        turns: job.turns,
      }),
    );
  }
  for (const district of source.districts.districts) {
    set.add('district', district.id, {
      name: district.name,
      description: district.blurb,
      shop: idOf(district.shop.name),
    });
    for (const client of district.clients) {
      set.add(
        'client',
        client.id,
        defined({
          name: client.name,
          title: client.title,
          description: client.blurb,
          side: client.side,
          district: district.id,
        }),
      );
    }
    for (const site of district.sites)
      set.add('site', site.id, { name: site.name, description: site.blurb, district: district.id });
  }
  for (const background of source.backgrounds.backgrounds) {
    const thread = source.quests.quests.find((q) => q.background === background.id);
    set.add(
      'background',
      background.id,
      defined({
        name: background.name,
        description: background.blurb,
        district: background.district,
        credits: background.start.credits,
        parts: { ...background.start.parts },
        crew: [...background.start.crew],
        ship: background.start.ship.placements.map((p) => p.type),
        captain: `captain-${background.id}`,
        pursuer: idOf(background.pursuer.name),
        thread: thread?.id,
        launch: background.launch.text,
        escaped: background.launch.escaped,
      }),
    );
  }
}
