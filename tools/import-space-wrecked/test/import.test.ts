/**
 * The committed records are what the import writes from source/ (M4.12): a fresh import over the
 * copy of Space-Wrecked's data matches games/space-wrecked/records/ byte for byte, file for file.
 * Change either by hand and this fails; run `pnpm import:space-wrecked` to write them again.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importFolder } from '../src/importAll.ts';
import { readRecords } from '../src/records.ts';
import { readSource } from '../src/source.ts';

const GAME = resolve(import.meta.dirname, '../../../games/space-wrecked');
const SOURCE = join(GAME, 'source');

describe('the Space-Wrecked import', () => {
  it('writes the records committed, byte for byte', () => {
    const made = importFolder(SOURCE).files();
    const committed = readRecords(join(GAME, 'records'), (path) => readFileSync(path, 'utf8'));
    expect(committed.map((f) => f.path)).toEqual(made.map((f) => f.path));
    for (const [i, file] of made.entries()) expect(committed[i]?.text, file.path).toBe(file.text);
  });

  it('carries every record of the families it imports', () => {
    const source = readSource(SOURCE);
    const paths = new Set(
      importFolder(SOURCE)
        .files()
        .map((f) => f.path),
    );
    const all = (type: string, ids: readonly string[]) => ids.filter((id) => !paths.has(`${type}/${id}.json`));
    expect(
      all(
        'item',
        source.modules.modules.map((m) => m.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'actor',
        source.jobs.jobs.map((j) => j.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'actor',
        source.enemies.enemies.map((e) => e.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'actor',
        source.companions.companions.map((c) => c.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'status',
        source.traits.traits.map((t) => t.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'encounter',
        source.encounters.encounters.map((e) => e.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'event',
        source.events.events.map((e) => e.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'quest',
        source.quests.quests.map((q) => q.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'contract',
        source.contracts.jobs.map((j) => j.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'faction',
        source.factions.sides.map((s) => s.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'background',
        source.backgrounds.backgrounds.map((b) => b.id),
      ),
    ).toEqual([]);
    expect(
      all(
        'node-kind',
        source.sectors.nodes.map((n) => n.id),
      ),
    ).toEqual([]);
    expect(source.events.events).toHaveLength(29);
    expect(source.quests.quests).toHaveLength(11);
  });
});
