/** The seven presets (M5.4, D66, docs/specs/environments.md#the-presets): each a sound record, written over a record keeping its name. */
import { compileProject, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { lookOf } from './look.ts';
import { PRESETS, withPreset } from './presets.ts';

describe('the presets', () => {
  it('are the seven the spec names, in its order', () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      'Desert',
      'Coast',
      'Forest',
      'Snow',
      'Cave',
      'Sci-fi interior',
      'Town',
    ]);
  });

  it('are each an environment with no problem', async () => {
    const files: Record<string, string> = {
      'project.json': '{ "format": 1, "id": "looks", "name": "Looks", "version": "0.1.0" }',
    };
    for (const preset of PRESETS) files[`records/environment/${preset.id}.json`] = JSON.stringify(preset.value);
    const result = await compileProject(memorySource(files), []);
    expect(result.diagnostics).toEqual([]);
    expect(result.records).toBe(PRESETS.length);
  });

  it('light their scenes: a sun up by day, none in a cave or a room, and weather where it falls', () => {
    const looks = Object.fromEntries(PRESETS.map((p) => [p.id, lookOf(p.value)]));
    for (const id of ['desert', 'coast', 'forest', 'snow', 'town']) expect(looks[id]?.sun.height).toBeGreaterThan(5);
    for (const id of ['cave', 'sci-fi-interior']) {
      expect(looks[id]?.sun.strength).toBe(0);
      expect(looks[id]?.skyLight.strength).toBe(PRESETS.find((p) => p.id === id)?.value['ambient-strength']);
    }
    expect([looks.snow?.weather, looks.snow?.particles]).toEqual(['snow', 1200]);
    expect([looks.town?.weather, looks.town?.particles]).toEqual(['rain', 1200]);
  });
});

describe('withPreset', () => {
  it('keeps the record’s name and nothing else of it', () => {
    const snow = PRESETS.find((p) => p.id === 'snow');
    const cave = PRESETS.find((p) => p.id === 'cave');
    if (!snow || !cave) throw new Error('no preset');
    const was = { name: 'Fell', ...snow.value };
    expect(withPreset(was, cave)).toEqual({ name: 'Fell', ...cave.value });
    expect(withPreset(was, cave)).not.toHaveProperty('weather');
    expect(withPreset({}, cave)).toEqual(cave.value);
    expect(withPreset(null, cave)).toEqual(cave.value);
  });
});
