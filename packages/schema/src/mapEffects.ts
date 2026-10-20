/**
 * The maps kit's effects (M4.6, D56, docs/specs/maps.md#effects), as fields: enter-map and
 * reveal-map. A drawn map's node is text: that its map has it is E053's.
 */
import { MAP, MAPS } from '@eb/kits';
import type { EffectFile } from './kitEffects.ts';

export const MAP_EFFECT_FILES: readonly EffectFile[] = [
  {
    effect: 'enter-map',
    kit: MAPS,
    label: 'Enter a map',
    fields: {
      map: { kind: 'ref', to: MAP, label: 'Map', description: 'A layered map is made anew from a seed each time' },
      at: {
        kind: 'text',
        min: 1,
        optional: true,
        label: 'At',
        description: 'A drawn map’s node to arrive at: its start when left out',
      },
    },
  },
  {
    effect: 'reveal-map',
    kit: MAPS,
    label: 'Reveal the map',
    fields: {
      reach: {
        kind: 'int',
        min: 1,
        max: 5,
        label: 'Reach',
        description: 'Every node this many links from the party is known: a scan',
      },
    },
  },
];
