import { describe, expect, it } from 'vitest';
import { KIT_IDS, KITS, kitsOn } from './kits.ts';
import { kitModules } from './modules.ts';

describe('the kits', () => {
  it('each have a module of their own id, joining a game in the engine’s order', () => {
    expect(kitModules(KIT_IDS).map((module) => module.id)).toEqual(KIT_IDS);
    expect(kitModules(['economy', 'inventory']).map((module) => module.id)).toEqual(['inventory', 'economy']);
    expect(kitModules([])).toEqual([]);
  });

  it('need only kits listed before them, so the engine’s order turns needs on first', () => {
    for (const [i, kit] of KITS.entries()) {
      for (const need of kit.needs) expect(KIT_IDS.indexOf(need)).toBeLessThan(i);
    }
  });

  it('turn on in the engine’s order, a kit whose need is off staying off (E034), an unknown or twice listed E033', () => {
    expect(kitsOn(['economy', 'inventory'])).toEqual({ on: ['inventory', 'economy'], problems: [] });
    expect(kitsOn(['economy']).on).toEqual([]);
    expect(kitsOn(['economy']).problems.map((p) => `${p.code} ${p.index}`)).toEqual(['E034 0']);
    expect(kitsOn(['inventory', 'magic', 'inventory']).problems.map((p) => `${p.code} ${p.index}`)).toEqual([
      'E033 1',
      'E033 2',
    ]);
  });
});
