/**
 * The World panel's lists and the preview above a map's form (M4.6, docs/specs/maps.md#the-editor):
 * a map's row by its shape; what a new map starts as, checked; a seed's map as the game makes it,
 * everything known; a drawn map as written; and the check over seeds in words, a rule's first broken
 * seed being the sweep's own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KITS, type MapRecord, makeLayered } from '@eb/kits';
import { type RecordInput, validateRecords } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { drawnMade, type Kinds, layeredMade, nextSeed, previewView, ruleRows } from './mapPreview.ts';
import { mapRow, newDrawnMap, newLayeredMap } from './worldList.ts';

const FIXTURES = join(import.meta.dirname, '../../../../tools/cli/test/fixtures');
const read = (path: string) => JSON.parse(readFileSync(join(FIXTURES, path), 'utf8'));
const SECTOR = read('drift/records/map/sector.json') as MapRecord;
const VALLEY = read('valley/records/map/valley.json') as MapRecord;
const KINDS: Kinds = (kind) => ({ name: kind === 'station' ? 'Station' : kind, description: `About ${kind}` });

describe('the World panel’s rows', () => {
  it('says each map’s shape and size', () => {
    expect(mapRow('sector', SECTOR)).toEqual({ id: 'sector', name: SECTOR.name, shape: 'layered', size: '7 layers' });
    expect(mapRow('valley', VALLEY)).toMatchObject({ shape: 'drawn', size: '5 nodes, 6 roads' });
    expect(mapRow('blank', {})).toEqual({
      id: 'blank',
      name: undefined,
      shape: undefined,
      size: 'Neither layered nor drawn yet',
    });
  });

  it('starts a new map that checks clean once it is named, with a kind to start from', () => {
    const kinds = KITS.map((kit) => kit.id);
    for (const [id, value] of [
      ['sector', newLayeredMap(['camp'])],
      ['valley', newDrawnMap(['camp'])],
    ] as const) {
      const records: RecordInput[] = [
        { type: 'node-kind', id: 'camp', value: { name: 'Camp' } },
        { type: 'map', id, value: { name: id, ...value } },
      ];
      const problems = validateRecords([], records, { kits: kinds }).diagnostics;
      expect(problems.map((p) => `${p.code} ${p.path} ${p.message}`)).toEqual([]);
    }
    // With no kind yet, the kind is left to pick: the checks say so.
    expect(newLayeredMap([])).toMatchObject({ layers: { start: '', end: '', mix: [{ kind: '', weight: 1 }] } });
  });
});

describe('the preview above a map’s form', () => {
  it('makes the seed’s map as the game would, every node known and named', () => {
    const layers = SECTOR.layers as NonNullable<MapRecord['layers']>;
    const made = layeredMade('sector', layers, KINDS, '7');
    expect(made).toEqual(makeLayered('sector', layers, (kind) => ({ name: KINDS(kind)?.name ?? kind }), '7'));
    const view = previewView(made as never, SECTOR, KINDS);
    expect(view).toMatchObject({ shape: 'layered', layers: 7, at: 'n0-0' });
    expect(view.nodes.every((node) => node.known && node.name !== null && node.travels.length === 0)).toBe(true);
    expect(view.nodes.find((node) => node.id === 'n0-0')?.description).toBe(`About ${SECTOR.layers?.start}`);
    expect(layeredMade('sector', { ...layers, mix: [] }, KINDS, '1')).toBeUndefined();
  });

  it('draws a drawn map at its places, its one-way roads marked', () => {
    const view = previewView(drawnMade('valley', VALLEY, KINDS), VALLEY, KINDS);
    const first = VALLEY.nodes?.[0];
    expect(view.nodes[0]).toMatchObject({ id: first?.id, x: first?.x, y: first?.y });
    expect(view.links).toHaveLength(VALLEY.roads?.length ?? 0);
    expect(view.links.filter((link) => link.oneWay)).toHaveLength(
      (VALLEY.roads ?? []).filter((road) => road['one-way']).length,
    );
  });

  it('says each rule in words with the seeds that keep it, and the first that breaks one', () => {
    const layers = SECTOR.layers as NonNullable<MapRecord['layers']>;
    const rows = ruleRows('sector', layers, KINDS);
    expect(rows?.map((row) => row.rule)).toEqual([
      '2 station, none two in a layer',
      '1 nebula, none two in a layer',
      'Every node is on a way from the start to the end',
      'No two links cross',
    ]);
    expect(rows?.every((row) => row.kept === 300 && row.of === 300 && row.first === undefined)).toBe(true);
    const tight = ruleRows(
      'sector',
      { ...layers, widths: { min: 1, max: 1 }, place: [{ kind: 'station', min: 6, max: 6 }] },
      KINDS,
      20,
    );
    expect(tight?.[0]).toMatchObject({ rule: '6 station', kept: 0, of: 20, first: { seed: '1', found: '5 station' } });
    // A rule half typed, at least over at most, makes no map: no rows, rather than a throw mid-draw.
    expect(ruleRows('sector', { ...layers, widths: { min: 3, max: 1 } }, KINDS, 5)).toBeUndefined();
  });

  it('moves the seed on by one, from 1 when the box holds none', () => {
    expect(nextSeed('7')).toBe('8');
    expect(nextSeed('')).toBe('1');
    expect(nextSeed('x')).toBe('1');
  });
});
