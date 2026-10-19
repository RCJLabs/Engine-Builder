/** The dialogue kit's effect (M3.8, D46, docs/specs/dialogue.md#effects), as fields: open-talk. */
import { DIALOGUE, TALK } from '@eb/kits';
import type { EffectFile } from './kitEffects.ts';

export const DIALOGUE_EFFECT_FILES: readonly EffectFile[] = [
  {
    effect: 'open-talk',
    kit: DIALOGUE,
    label: 'Open a talk',
    fields: {
      talk: { kind: 'ref', to: TALK, label: 'Talk', description: 'It waits its turn while another is open' },
    },
  },
];
