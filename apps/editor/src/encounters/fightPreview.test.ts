/**
 * The fight above an encounter's form (M4.7, docs/specs/encounters.md#the-editor): for the drift's
 * raiders and the pit's bouts, the table the editor works out from the records is row for row the
 * table the sim previews as a game starts; a party of one fights alone; half-typed, it says why.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGame, createRecordStore, defineModule, engineModules, type GameState } from '@eb/core';
import { kitModules, kitsOn } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { actorsIn, fightFor, type Held, outcomeWords } from './fightPreview.ts';

const FIXTURES = join(import.meta.dirname, '../../../../tools/cli/test/fixtures');

function project(name: string) {
  const dir = join(FIXTURES, name, 'records');
  const held: Held[] = readdirSync(dir).flatMap((type) =>
    readdirSync(join(dir, type)).map((file) => ({
      type,
      id: file.replace(/\.json$/, ''),
      value: JSON.parse(readFileSync(join(dir, type, file), 'utf8')),
    })),
  );
  const kits = kitsOn(JSON.parse(readFileSync(join(FIXTURES, name, 'project.json'), 'utf8')).kits).on;
  return { held, kits };
}

/** The sim's own preview of a fight, as a game of these records starts. */
function simRows(held: readonly Held[], kits: readonly string[], fight: Record<string, unknown>) {
  const pack: Record<string, Record<string, unknown>> = {};
  for (const { type, id, value } of held) pack[type] = { ...(pack[type] ?? {}), [id]: value };
  const still = defineModule<Record<string, never>>({
    id: 'still',
    init: () => ({}),
    modes: { still: { actions: [] } },
  });
  const game = createGame({ modules: [...engineModules, ...kitModules(kits), still], start: 'still' });
  const sim = { content: createRecordStore(pack) };
  const state: GameState = game.init('preview', sim);
  return (game.preview(state, [{ effect: 'fight', ...fight }], sim)[0] as unknown as { rows: unknown }).rows;
}

describe('the fight above an encounter’s form', () => {
  it('works out the drift’s raiders as the sim does, against the ship the encounter names', () => {
    const { held, kits } = project('drift');
    const value = held.find((h) => h.type === 'encounter' && h.id === 'raiders')?.value;
    const worked = fightFor(held, kits, 'raiders', value, { as: 'written' });
    if (!('table' in worked)) throw new Error(worked.why);
    expect(worked.against).toEqual(['ship']);
    expect(worked.table.rows).toEqual(simRows(held, kits, { encounter: 'raiders' }));
    expect(worked.table.outcomes.map((o) => outcomeWords(o, 'Hull').head)).toEqual(['Win 67%', 'Draw 16%', 'Lose 17%']);
  });

  it('fights the roster’s start when the encounter names no fighters, and one actor when picked', () => {
    const { held, kits } = project('pit');
    const bandits = held.find((h) => h.type === 'encounter' && h.id === 'bandits')?.value;
    const melee = fightFor(held, kits, 'bandits', bandits, { as: 'written' });
    if (!('table' in melee)) throw new Error(melee.why);
    expect(melee.against).toEqual(['crixus', 'spartacus']);
    expect(melee.table.rows).toEqual(simRows(held, kits, { encounter: 'bandits' }));
    const thraex = held.find((h) => h.type === 'encounter' && h.id === 'thraex')?.value;
    const alone = fightFor(held, kits, 'thraex', thraex, { as: 'one', actor: 'spartacus' });
    if (!('table' in alone)) throw new Error(alone.why);
    expect(alone.against).toEqual(['spartacus']);
    expect(alone.table.rows).toEqual(simRows(held, kits, { encounter: 'thraex', fighters: ['spartacus'] }));
    expect(actorsIn(held)).toEqual(['bandit', 'crixus', 'murmillo', 'retiarius', 'spartacus', 'thraex']);
  });

  it('reads the form’s value over the record, so a foe typed in changes the table at once', () => {
    const { held, kits } = project('drift');
    const raiders = held.find((h) => h.type === 'encounter' && h.id === 'raiders')?.value as Record<string, unknown>;
    const two = fightFor(
      held,
      kits,
      'raiders',
      { ...raiders, foes: [{ actor: 'raider', count: 2 }] },
      { as: 'written' },
    );
    const one = fightFor(held, kits, 'raiders', raiders, { as: 'written' });
    if (!('table' in two) || !('table' in one)) throw new Error('no table');
    const win = (t: typeof one) => ('table' in t ? (t.table.outcomes.find((o) => o.result === 'win')?.chance ?? 0) : 0);
    expect(win(two)).toBeLessThan(win(one));
  });

  it('says why there is no table for a value half typed', () => {
    const { held, kits } = project('drift');
    expect(fightFor(held, kits, 'raiders', { combat: 'broadside', foes: [] }, { as: 'written' })).toEqual({
      why: 'Give it a combat and a foe to see how the fight goes.',
    });
    expect(
      fightFor(held, kits, 'raiders', { combat: 'nowhere', foes: [{ actor: 'raider' }] }, { as: 'written' }),
    ).toEqual({
      why: 'Fix the problems above to see how the fight goes.',
    });
  });

  it('words each result: its chance, then what is lost and who falls', () => {
    expect(outcomeWords({ result: 'win', chance: 67, hurt: [0, 10], falls: [0, 0] }, 'Hull')).toEqual({
      head: 'Win 67%',
      after: '0 to 10 Hull lost, none fall',
    });
    expect(outcomeWords({ result: 'lose', chance: 17, hurt: [12, 12], falls: [1, 1] }, 'Hull').after).toBe(
      '12 Hull lost, 1 falls',
    );
    expect(outcomeWords({ result: 'draw', chance: 5, hurt: [0, 0], falls: [0, 2] }, 'Vigour').after).toBe(
      'nothing lost, 0 to 2 fall',
    );
  });
});
