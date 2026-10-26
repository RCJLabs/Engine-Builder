/**
 * project.json's fighting as a form sees it (M6.4, D76): who the player is and which combat record
 * a hit reads, as a type file so the record form's pickers draw it; and its problems, which are
 * project.json's E082 under /fighting, the one that says it is missing being the whole form's.
 */
import { MANIFEST_FILE } from '@eb/compiler';
import { ACTOR, COMBAT } from '@eb/kits';
import type { Diagnostic, TypeFile } from '@eb/schema';

export const FIGHTING_FILE: TypeFile = {
  title: 'Fighting',
  fields: {
    player: {
      kind: 'ref',
      to: ACTOR,
      label: 'Player',
      description: 'The actor the player is: their stats take the blows and their gear is what they fight with.',
    },
    combat: {
      kind: 'ref',
      to: COMBAT,
      label: 'Combat',
      description: 'The combat record that says which stat is health, and which add to a blow and take from one.',
    },
  },
};

const AT = '/fighting';

/** project.json's problems with its fighting, each at its field ('' for the whole of it, and for it missing). */
export function fightingProblems(problems: readonly Diagnostic[]): Diagnostic[] {
  return problems.flatMap((d) => {
    if (d.file !== MANIFEST_FILE || d.code !== 'E082') return [];
    return [{ ...d, path: d.path.startsWith(AT) ? d.path.slice(AT.length) : '' }];
  });
}
