/**
 * What a battle told, in words, a line each (M7.5, D87; from space-wrecked's src/sim/battleLog.js): for the
 * stage's line that says what happened, and the golden battle. Units are named with their ids ("Pirate
 * e2"), since two can share a name.
 */
import type { Tile } from '@eb/core';
import type { Told } from './types.ts';

const SIDE: Readonly<Record<string, string>> = { crew: 'the crew', foes: 'the enemy' };
const SIDE_NAME: Readonly<Record<string, string>> = { n: 'north', e: 'east', s: 'south', w: 'west' };

export interface LineWords {
  /** A unit's name and id, as "Marine c1". */
  name(id: string): string;
  /** A tile as written, "(c, r)" unless a caller counts rows otherwise. */
  place?(tile: Tile): string;
}

const turns = (n: number) => `${n} turn${n === 1 ? '' : 's'}`;

/** The line for one thing a battle told. */
export function lineOf(told: Told, words: LineWords): string {
  const place = words.place ?? (([c, r]: Tile) => `(${c}, ${r})`);
  const who = typeof told.unit === 'string' ? words.name(told.unit) : '';
  const them = typeof told.target === 'string' ? words.name(told.target) : '';
  switch (told.type) {
    case 'turn':
      return `Round ${told.round}: ${SIDE[told.side as string]}'s turn.`;
    case 'ended':
      return `End of ${SIDE[told.side as string]}'s turn.`;
    case 'moved':
      return `${who} moves ${(told.path as Tile[]).map(place).join(' to ')}.`;
    case 'opened':
      return `${who} opens the door on the ${SIDE_NAME[told.side as string]} side of ${place(told.at as Tile)}.`;
    case 'shot': {
      const shot = `${who} ${told.watch ? 'fires on overwatch at' : 'shoots'} ${them}: ${told.chance}%, rolled ${told.roll}`;
      if (!told.hit) return `${shot}, missed.`;
      const crit = told.crit ? `, crit (${told.critChance}%, rolled ${told.critRoll})` : '';
      return `${shot}, hit${crit} for ${told.damage}.`;
    }
    case 'down':
      return `${who} is down, bleeding out in ${turns(told.bleed as number)}.`;
    case 'dead':
      return `${who} is dead.`;
    case 'bled':
      return `${who} is bleeding out: ${turns(told.bleed as number)} left.`;
    case 'out':
      return told.dead ? `${who} bled out and died.` : `${who} bled out: out of the fight, badly hurt.`;
    case 'steadied':
      return `${who} steadies ${them}.`;
    case 'watched':
      return `${who} goes on overwatch.`;
    case 'reloaded':
      return `${who} reloads: ${told.ammo} shots.`;
    case 'ordered':
      return orderLine(told, who, them, place);
    case 'asleep':
      return `${who} is asleep and does nothing.`;
    case 'woke':
      return `${who} wakes up.`;
    case 'unwelded': {
      const [c, r, side] = (told.key as string).split(',');
      return `The weld on the door on the ${SIDE_NAME[side as string]} side of ${place([Number(c), Number(r)])} gives way: the door is shut.`;
    }
    case 'over':
      return told.winner === 'crew' ? 'The crew wins.' : 'The enemy wins.';
    default:
      return JSON.stringify(told);
  }
}

function orderLine(told: Told, who: string, them: string, place: (tile: Tile) => string): string {
  switch (told.kind) {
    case 'suppress':
      return `${who} suppresses ${them}: its shots ${told.aim} until its side's turn ends.`;
    case 'weld':
      return `${who} welds the door on the ${SIDE_NAME[told.side as string]} side of ${place(told.at as Tile)} shut, to round ${told.until}.`;
    case 'patch':
      return told.up
        ? `${who} patches ${them} up: back on their feet with ${told.hp}.`
        : `${who} patches ${them}: ${told.healed} back, ${told.hp} now.`;
    case 'hustle':
      return `${who} hustles: ${told.ap} more action${told.ap === 1 ? '' : 's'} this turn.`;
    case 'mark':
      return `${who} marks ${them}: the crew's shots at it +${told.aim}.`;
    case 'sedate': {
      const dart = `${who} darts ${them}: ${told.chance}%, rolled ${told.roll}`;
      return told.hit ? `${dart}, asleep.` : `${dart}, missed.`;
    }
    case 'kit':
      return `${who} kits ${told.target === told.unit ? 'up' : `${them} out`}: armor +${told.armor}, ${told.ammo} shots.`;
    default:
      return JSON.stringify(told);
  }
}
