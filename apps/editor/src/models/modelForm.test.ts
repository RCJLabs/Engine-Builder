/** The model's slots and the material's presets as the forms write them (M5.5, D67). */
import { MATERIAL_PRESETS } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { materialWithPreset, slotMaterial, withSlot } from './modelForm.ts';

describe('a model’s slots', () => {
  const now = [
    { slot: 'wood', material: 'oak' },
    { slot: '#1', material: 'iron' },
  ];

  it('reads the material a slot is given, or none', () => {
    expect(slotMaterial(now, '#1')).toBe('iron');
    expect(slotMaterial(now, 'cloth')).toBeNull();
    expect(slotMaterial(undefined, 'wood')).toBeNull();
  });

  it('changes a slot in place, adds one after the others, and takes one back to the file', () => {
    expect(withSlot(now, 'wood', 'pine')).toEqual([
      { slot: 'wood', material: 'pine' },
      { slot: '#1', material: 'iron' },
    ]);
    expect(withSlot(now, 'cloth', 'linen')).toEqual([...now, { slot: 'cloth', material: 'linen' }]);
    expect(withSlot(now, 'wood', null)).toEqual([{ slot: '#1', material: 'iron' }]);
  });

  it('leaves the list out once no slot is in it', () => {
    expect(withSlot([{ slot: 'wood', material: 'oak' }], 'wood', null)).toBeUndefined();
    expect(withSlot(undefined, 'wood', null)).toBeUndefined();
    expect(withSlot(undefined, 'wood', 'oak')).toEqual([{ slot: 'wood', material: 'oak' }]);
  });
});

describe('a material from a preset', () => {
  it('takes the preset’s values and keeps its own name', () => {
    const glass = MATERIAL_PRESETS.find((p) => p.id === 'glass');
    if (!glass) throw new Error('no glass preset');
    expect(materialWithPreset({ name: 'Window', color: '#000000', metalness: 1 }, glass)).toEqual({
      name: 'Window',
      ...glass.value,
    });
    expect(materialWithPreset(undefined, glass)).toEqual(glass.value);
  });
});
