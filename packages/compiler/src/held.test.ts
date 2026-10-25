/**
 * What a space's zones and interacts hold (M5.9, D71): their effects and conditions are heard by the
 * kits' checks as a record's are, so a quest started by a pickup is started (W125), and a zone that
 * sets a stage the quest lacks is E043, at the space's line.
 */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';

const json = (value: unknown) => JSON.stringify(value, null, 2);

const QUEST = {
  name: 'Supplies',
  stages: [
    {
      id: 'gather',
      log: 'Take a rope.',
      next: 'stored',
      objectives: [{ id: 'rope', text: 'Take a rope', 'done-when': 'inventory.count(item: rope) >= 1' }],
    },
    { id: 'stored', log: 'Stored.' },
  ],
};

function glen(objects: unknown[]) {
  return memorySource({
    'project.json': json({ format: 1, id: 'glen', name: 'Glen', version: '0.1.0', kits: ['inventory', 'quests'] }),
    'records/item/rope.json': json({ name: 'Rope' }),
    'records/quest/supplies.json': json(QUEST),
    'spaces/glen.json': json({ name: 'Glen', objects }),
  });
}

const take = {
  id: 'rope',
  shape: 'box',
  components: {
    interact: {
      label: 'Take',
      effects: [
        { effect: 'give-item', item: 'rope' },
        { effect: 'start-quest', quest: 'supplies' },
      ],
      takes: true,
    },
  },
};

const brief = (found: Awaited<ReturnType<typeof compileProject>>) =>
  found.diagnostics.map(({ code, file, path, line }) => ({ code, file, path, line }));

describe('what zones and interacts hold', () => {
  it('starts a quest from an interact, as a record’s effect would', async () => {
    expect(brief(await compileProject(glen([take]), []))).toEqual([]);
    expect(brief(await compileProject(glen([]), [])).map((d) => d.code)).toEqual(['W125']);
  });

  it('gives a zone’s set-stage of a stage the quest lacks as E043, and its condition’s too, at the space’s line', async () => {
    const gate = {
      id: 'gate',
      shape: 'box',
      components: {
        trigger: {
          when: 'quests.reached(quest: supplies, stage: gathered)',
          effects: [{ effect: 'set-stage', quest: 'supplies', stage: 'shed' }],
        },
      },
    };
    const found = brief(await compileProject(glen([take, gate]), []));
    expect(found).toEqual([
      { code: 'E043', file: 'spaces/glen.json', path: '/objects/1/components/trigger/effects/0/stage', line: 34 },
      { code: 'E043', file: 'spaces/glen.json', path: '/objects/1/components/trigger/when', line: 29 },
    ]);
  });
});
