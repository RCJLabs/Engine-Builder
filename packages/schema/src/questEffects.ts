/**
 * The quests kit's effects (M3.9, D47, docs/specs/quests.md#effects), as fields: start-quest,
 * set-stage and fail-quest. A stage is text: that its quest has it is E043's.
 */
import { QUEST, QUESTS } from '@eb/kits';
import type { EffectFile } from './kitEffects.ts';

const QUEST_FIELD = { kind: 'ref', to: QUEST, label: 'Quest' } as const;

export const QUEST_EFFECT_FILES: readonly EffectFile[] = [
  {
    effect: 'start-quest',
    kit: QUESTS,
    label: 'Start a quest',
    fields: { quest: { ...QUEST_FIELD, description: 'At its first stage; one that has started is left as it is' } },
  },
  {
    effect: 'set-stage',
    kit: QUESTS,
    label: 'Set a quest’s stage',
    fields: {
      quest: { ...QUEST_FIELD, description: 'One not started starts there; one that has ended is left' },
      stage: { kind: 'text', min: 1, label: 'Stage', description: 'A stage’s id' },
    },
  },
  {
    effect: 'fail-quest',
    kit: QUESTS,
    label: 'Fail a quest',
    fields: {
      quest: { ...QUEST_FIELD, description: 'Only one that is active' },
      why: {
        kind: 'text',
        min: 1,
        optional: true,
        label: 'Why',
        description: 'What the journal says: “It was given up.” when left out',
      },
    },
  },
];
