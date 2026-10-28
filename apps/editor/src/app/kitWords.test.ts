/**
 * Every kit's box says what it is called and what it brings (M3.3), the tactics kit's since M7.5: a kit added
 * to KITS without words would show a bare id beside its box.
 */
import { KITS } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { KIT_WORDS } from './kitWords.ts';

describe('the kits’ words', () => {
  it('name each kit and say what it brings, its needs among them', () => {
    expect(Object.keys(KIT_WORDS).sort()).toEqual(KITS.map((k) => k.id).sort());
    for (const { id, needs } of KITS) {
      const words = KIT_WORDS[id];
      expect(words?.name, id).toMatch(/^[A-Z]/);
      expect(words?.brings, id).toMatch(/\.$/);
      for (const need of needs) expect(words?.brings, `${id} needs ${need}`).toContain(KIT_WORDS[need]?.name);
    }
  });
});
