import { canonicalJson, createRecordStore, readPack } from '@eb/core';
import {
  addToFlagEffect,
  DIAGNOSTIC_CODES,
  type Diagnostic,
  ENGINE_EVENTS,
  ENGINE_FACTS,
  setFlagEffect,
} from '@eb/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { eventTypes, facts } from '../../schema/test/events.ts';
import { sampleTypes } from '../../schema/test/samples.ts';
import { FIXTURE_V1, readFixture } from '../test/fixture.ts';
import { compileProject, memorySource } from './index.ts';

// The v1 fixture's pack hash, which docs/specs/state_hash_oracle.py also computes from the
// fixture's files. A change here changes every pack built so far, so it needs a decision.
const V1_HASH = '489cedf323bd33d9';

const fixture = () => readFixture(FIXTURE_V1);
const compile = (files: Record<string, string | Uint8Array>) => compileProject(memorySource(files), sampleTypes);
const brief = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.map(({ code, file, path, message }) => ({ code, file, path, message }));

/** The fixture with some files replaced or added; `null` removes one. */
function changed(changes: Record<string, string | Uint8Array | null>): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = fixture();
  for (const [path, content] of Object.entries(changes)) {
    if (content === null) delete files[path];
    else files[path] = content;
  }
  return files;
}

describe('the v1 fixture', () => {
  it('compiles to its golden hash with no diagnostics', async () => {
    const result = await compile(fixture());
    expect(result.diagnostics).toEqual([]);
    expect(result.records).toBe(4);
    expect(result.pack?.project).toEqual({ id: 'salvage-run', name: 'Salvage Run', version: '0.1.0' });
    expect(result.pack?.hash).toBe(V1_HASH);
  });

  it('gives a pack the runtime can read back from a file', async () => {
    const { pack } = await compile(fixture());
    const store = createRecordStore(readPack(JSON.parse(canonicalJson(pack))).records);
    expect(store.types()).toEqual(['actor', 'item', 'loot-table']);
    expect(store.getOrThrow('actor', 'rook')).toMatchObject({ drops: 'dead-hauler' });
  });

  it('hashes the same whatever the file order, key order or formatting', async () => {
    const reverseKeys = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reverseKeys)
        : typeof value === 'object' && value !== null
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([k, v]) => [k, reverseKeys(v)]),
            )
          : value;
    const styles = [
      (v: unknown) => JSON.stringify(v),
      (v: unknown) => JSON.stringify(v, null, 4),
      (v: unknown) => `﻿${JSON.stringify(reverseKeys(v), null, '\t')}\n`,
    ];
    const entries = Object.entries(fixture());
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(entries, { minLength: entries.length }),
        fc.array(fc.nat(styles.length - 1), { minLength: entries.length, maxLength: entries.length }),
        async (shuffled, picks) => {
          const files = Object.fromEntries(
            shuffled.map(([path, text], i) => [path, (styles[picks[i] ?? 0] ?? JSON.stringify)(JSON.parse(text))]),
          );
          const result = await compile(files);
          expect(result.diagnostics).toEqual([]);
          expect(result.pack?.hash).toBe(V1_HASH);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('hashes differently when a record or the project changes', async () => {
    const edited = await compile(changed({ 'records/item/salvage.json': '{ "name": "Salvage", "weight": 4 }' }));
    const renamed = await compile(
      changed({ 'project.json': fixture()['project.json']?.replace('0.1.0', '0.1.1') ?? '' }),
    );
    expect(edited.pack?.hash).not.toBe(V1_HASH);
    expect(renamed.pack?.hash).not.toBe(V1_HASH);
    expect(edited.pack?.hash).not.toBe(renamed.pack?.hash);
  });
});

describe('project.json', () => {
  const manifest = (value: unknown) => changed({ 'project.json': JSON.stringify(value) });
  const base = { format: 1, id: 'salvage-run', name: 'Salvage Run', version: '0.1.0' };

  it.each([
    ['missing', changed({ 'project.json': null }), 'E008', '', 'Missing project.json'],
    ['not JSON', changed({ 'project.json': '{ "format": 1,' }), 'E007', '', 'Not valid JSON: '],
    ['not an object', manifest([1]), 'E008', '', 'Invalid input: expected object, received array'],
    ['with an unknown field', manifest({ ...base, author: 'x' }), 'E008', '/author', 'Unknown field "author"'],
    ['without a name', manifest({ ...base, name: undefined }), 'E008', '/name', 'Missing field "name"'],
    ['with a bad id', manifest({ ...base, id: 'Salvage Run' }), 'E008', '/id', 'Not a valid project id'],
    ['with a bad version', manifest({ ...base, version: 'v1' }), 'E008', '/version', 'Expected a version like'],
    ['from an older or odd format', manifest({ ...base, format: 0 }), 'E008', '/format', 'Invalid input: expected 1'],
    ['from a newer format', manifest({ ...base, format: 2 }), 'E009', '/format', 'This project is format 2'],
  ])('reports project.json %s, and builds no pack', async (_name, files, code, path, message) => {
    const result = await compile(files);
    expect(brief(result.diagnostics)).toEqual([
      { code, file: 'project.json', path, message: expect.stringContaining(message) },
    ]);
    expect(result.pack).toBeNull();
  });

  it('accepts a pre-release version', async () => {
    expect((await compile(manifest({ ...base, version: '1.0.0-beta.2' }))).pack).not.toBeNull();
  });
});

describe('record files', () => {
  it('reports a record that is not JSON once, without failing the references to it', async () => {
    const result = await compile(changed({ 'records/item/medkit.json': '{ "name": "Medkit", }' }));
    expect(result.diagnostics.map(({ code, type, id, file }) => ({ code, type, id, file }))).toEqual([
      { code: 'E007', type: 'item', id: 'medkit', file: 'records/item/medkit.json' },
    ]);
    expect(result.pack).toBeNull();
  });

  it('reports bytes that are not UTF-8, and reads a byte order mark', async () => {
    const result = await compile(
      changed({
        'records/item/medkit.json': new Uint8Array([0x7b, 0xff, 0x7d]),
        'records/item/salvage.json': '﻿{ "name": "Salvage", "weight": 3 }',
      }),
    );
    expect(brief(result.diagnostics)).toEqual([
      { code: 'E007', file: 'records/item/medkit.json', path: '', message: 'Not valid UTF-8' },
    ]);
  });

  it('reports JSON files at the wrong depth as errors, and other files as warnings', async () => {
    const result = await compile(
      changed({
        'records/medkit.json': '{}',
        'records/item/spare/medkit.json': '{}',
        'records/item/notes.md': 'Medkits heal 2.',
      }),
    );
    expect(brief(result.diagnostics)).toEqual([
      {
        code: 'W101',
        file: 'records/item/notes.md',
        path: '',
        message: 'Ignored: record files are records/<type>/<id>.json',
      },
      {
        code: 'E010',
        file: 'records/item/spare/medkit.json',
        path: '',
        message: 'A record file must sit at records/<type>/<id>.json',
      },
      {
        code: 'E010',
        file: 'records/medkit.json',
        path: '',
        message: 'A record file must sit at records/<type>/<id>.json',
      },
    ]);
  });

  it('still builds the pack when there are only warnings', async () => {
    const result = await compile(changed({ 'records/item/notes.md': 'Medkits heal 2.' }));
    expect(result.diagnostics.map((d) => d.severity)).toEqual(['warning']);
    expect(result.pack?.hash).toBe(V1_HASH);
  });

  it("names the file in validation's diagnostics, with types from folders and ids from file names", async () => {
    const result = await compile(
      changed({
        'records/item/medkit.json': '{ "name": "Medkit", "weight": "light" }',
        'records/item/Big Gun.json': '{ "name": "Big Gun", "weight": 9 }',
        'records/weapon/laser.json': '{}',
      }),
    );
    expect(result.diagnostics.map(({ code, type, id, file, path }) => ({ code, type, id, file, path }))).toEqual([
      { code: 'E003', type: 'item', id: 'Big Gun', file: 'records/item/Big Gun.json', path: '' },
      { code: 'E001', type: 'item', id: 'medkit', file: 'records/item/medkit.json', path: '/weight' },
      { code: 'E002', type: 'weapon', id: 'laser', file: 'records/weapon/laser.json', path: '' },
    ]);
  });
});

describe('the code table', () => {
  it('has a compile that fires every code', async () => {
    const broken = await compile(
      changed({
        'records/item/medkit.json': '{ "name": "Medkit", "weight": "light" }',
        'records/weapon/laser.json': '{}',
        'records/item/Big Gun.json': '{ "name": "Big Gun", "weight": 9 }',
        'records/actor/rook.json': '{ "name": "Rook", "drops": "nowhere" }',
        'records/loot-table/odd.json':
          '{ "rolls": [1, 1], "entries": [], "effects": [{ "op": "mark", "target": "loot-table:odd" }] }',
        'records/item/spare.json': '{',
        'records/medkit.json': '{}',
        'records/item/notes.md': '',
      }),
    );
    const duplicate = await compile(changed({ 'records/item/salvage.json': null }));
    const newer = await compile(changed({ 'project.json': '{ "format": 9 }' }));
    const invalid = await compile(changed({ 'project.json': '{ "format": 1 }' }));
    const when = (...conditions: unknown[]) =>
      JSON.stringify({ choices: Object.fromEntries(conditions.map((c, i) => [`c${i}`, { when: c, effects: [] }])) });
    const slots = Array.from({ length: 9 }, (_, i) => ({ fact: 'hold.slot', args: { i }, op: '>', value: 50 }));
    const conditions = await compileProject(
      memorySource(
        changed({
          'records/event/odd.json': when(
            { all: [{ fact: 'voyage.night' }] },
            { fact: 'voyage.storm' },
            { fact: 'hold.count', args: { item: 'ghost' }, op: '>', value: 0 },
            { fact: 'voyage.leader', op: '==', value: 'ghost' },
            { fact: 'hold.credits', op: '<', value: 0 },
            { fact: 'hold.credits', op: '>=', value: 0 },
            { all: [...slots, { fact: 'hold.slot', args: { i: 0 }, op: '<', value: 10 }] },
          ),
        }),
      ),
      eventTypes,
      { facts },
    );
    // Type files (M2.4): one that breaks the format, one naming a type nobody has, one in a
    // folder, a note beside them, and an asset field naming a file that isn't there.
    const types = await compile(
      changed({
        'types/crate.json': '{ "title": "Crate", "fields": { "art": { "kind": "asset" }, "x": { "kind": "x" } } }',
        'types/box.json':
          '{ "title": "Box", "fields": { "art": { "kind": "asset" }, "of": { "kind": "ref", "to": "nothing" } } }',
        'types/bag.json': '{ "title": "Bag", "fields": { "art": { "kind": "asset" } } }',
        'records/bag/sack.json': '{ "art": "sack.png" }',
        'types/old/bag.json': '{}',
        'types/notes.md': '',
      }),
    );
    // Assets (M2.7): a file the log leaves out, a refused licence, an entry of the wrong shape for a
    // file that isn't there, and a stand-in.
    const day = '2026-10-18';
    const assets = await compile(
      changed({
        'assets/a.png': 'png',
        'assets/b.png': 'png',
        'assets/hero.svg': '<svg/>',
        'assets/assets.json': JSON.stringify({
          files: {
            'b.png': { licence: 'CC-BY-NC-4.0', source: 'a forum', date: day },
            'gone.png': { licence: 'own', source: 'drawn here', date: 'yesterday' },
            'hero.svg': { licence: 'own', source: 'the editor', date: day, standIn: true },
          },
        }),
      }),
    );
    // Sheets and flags (M3.1), with a game's catalogue, so an event or effect it lacks is an error:
    // a flag whose bounds cross, one set but never read, one read but never set, one never named;
    // an unknown event, an argument the event lacks, two rows with one id, an unknown effect, and
    // an on/off flag set to a number.
    const sheets = await compileProject(
      memorySource(
        changed({
          'records/flag/met.json': '{}',
          'records/flag/raids.json': '{ "number": { "min": 5, "max": 1 } }',
          'records/flag/set-only.json': '{}',
          'records/flag/read-only.json': '{}',
          'records/sheet/trader.json': JSON.stringify({
            rows: [
              { id: 'a', when: { event: 'nobody/heard' }, do: [] },
              {
                id: 'a',
                when: { event: 'flag/changed', args: { flag: 'met', loud: true } },
                do: [
                  { effect: 'nothing' },
                  { effect: 'set-flag', flag: 'met', to: 3 },
                  { effect: 'set-flag', flag: 'set-only', to: true },
                ],
              },
              { id: 'b', when: { event: 'flag/changed' }, if: 'flag.on(read-only)', do: [] },
            ],
          }),
        }),
      ),
      eventTypes,
      { facts: { ...facts, ...ENGINE_FACTS }, events: ENGINE_EVENTS, effects: [setFlagEffect(), addToFlagEffect()] },
    );
    // Scripts (M3.2): one that doesn't parse, one that breaks a purity rule and imports what it
    // may not, a misplaced one, a note beside them, and none of them reached from a game.ts.
    const scripts = await compile(
      changed({
        'scripts/broken.ts': 'const a = ;',
        'scripts/impure.ts': "import { z } from 'zod';\nexport const r = Math.random();",
        'scripts/old/game.ts': '',
        'scripts/notes.md': '',
      }),
    );
    // Kits (M3.3): one the engine doesn't have, one whose need is left out, a resource that starts
    // below its lowest, a table in a loop, a project's field with a kit field's name, and a shop
    // that stocks again in a game without days; and (M3.4) a status that lasts days there too.
    const kitted = (
      kits: string[],
      files: Record<string, string>,
      more = {},
      options: object = { facts: ENGINE_FACTS },
    ) =>
      compileProject(
        memorySource({
          'project.json': JSON.stringify({ format: 1, id: 'kits', name: 'Kits', version: '0.1.0', kits, ...more }),
          ...files,
        }),
        [],
        options,
      );
    const kits = await kitted(['inventory', 'economy', 'stats', 'magic'], {
      'records/status/bleeding.json': '{ "lasts": { "days": 3 } }',
      'records/resource/credits.json': '{ "start": -1 }',
      'records/loot-table/a.json': '{ "entries": [{ "table": "a", "weight": 1 }] }',
      'records/shop/yard.json': '{ "currency": "credits", "stock": { "every": { "days": 2 } } }',
      'types/item.json': '{ "fields": { "value": { "kind": "text" } } }',
    });
    const needs = await kitted(['economy'], {});
    // M3.5: a calendar with no weekdays in its list, and a row naming a band its faction lacks;
    // then a faction that drifts in a game without the time module, whose calendar nothing reads.
    const timed = await kitted(
      ['factions', 'time'],
      {
        'records/faction/guild.json': '{ "bands": [{ "id": "friendly" }] }',
        'records/sheet/watch.json': JSON.stringify({
          rows: [
            {
              id: 'a',
              when: { event: 'time/day-started' },
              if: 'factions.reached(faction: guild, band: frendly)',
              do: [],
            },
          ],
        }),
      },
      { calendar: { ticksPerDay: 1, weekdays: [] } },
    );
    const drifting = await kitted(
      ['factions'],
      { 'records/faction/rivals.json': '{ "drift": { "every": 8 } }' },
      { calendar: { ticksPerDay: 24 } },
      { facts: ENGINE_FACTS, events: ENGINE_EVENTS },
    );
    // M3.6: a recruit's fee in a game without the economy kit, and a row naming a rank the roster lacks.
    const rostered = await kitted(['stats', 'roster'], {
      'records/stat/fights.json': '{}',
      'records/actor/hand.json': '{}',
      'records/recruit/deckhand.json': '{ "actor": "hand", "names": ["Ketil"], "fee": { "credits": 30 } }',
      'records/roster/crew.json': '{ "ranks": { "stat": "fights", "bands": [{ "id": "green" }] } }',
      'records/sheet/watch.json': JSON.stringify({
        rows: [{ id: 'a', when: { event: 'roster/joined' }, if: 'roster.ranked(veteran) >= 1', do: [] }],
      }),
    });
    // M3.7: an event every choice of which costs, in a game without the economy kit or a time module,
    // a consequence counting days, and a row naming a choice the event lacks.
    const evented = await kitted(
      ['events'],
      {
        'records/event/toll.json': JSON.stringify({
          choices: [
            {
              id: 'pay',
              label: 'Pay',
              cost: { scrap: 5 },
              effects: [{ effect: 'later', after: { days: 2 }, do: [] }],
            },
          ],
        }),
        'records/sheet/watch.json': JSON.stringify({
          rows: [{ id: 'a', when: { event: 'events/chosen' }, if: 'events.chose(event: toll, choice: run)', do: [] }],
        }),
      },
      undefined,
      { facts: ENGINE_FACTS, events: ENGINE_EVENTS },
    );
    // M3.8: a talk nothing opens, with a line no start reaches and a line whose one option can be
    // locked, and a row naming a line the talk lacks.
    const talked = await kitted(['dialogue'], {
      'records/talk/marge.json': JSON.stringify({
        starts: [{ line: 'hello' }],
        lines: [
          {
            id: 'hello',
            text: 'Hi',
            options: [{ id: 'ask', label: 'Ask', needs: 'dialogue.talked(talk: marge) >= 2' }],
          },
          { id: 'lost', text: 'Lost' },
        ],
      }),
      'records/sheet/watch.json': JSON.stringify({
        rows: [
          { id: 'a', when: { event: 'dialogue/ended' }, if: 'dialogue.heard(talk: marge, line: summit) >= 1', do: [] },
        ],
      }),
    });
    // M3.9: a quest nothing starts, two stages it can't end from, one nothing brings it to, and a
    // row naming a stage the quest lacks.
    const goal = (next: string) => ({
      id: next === 'round' ? 'pay' : 'back',
      text: 'Go',
      'done-when': 'flag.on(paid)',
      next,
    });
    const quested = await kitted(['quests'], {
      'records/quest/debt.json': JSON.stringify({
        name: 'Debt',
        stages: [
          { id: 'owed', objectives: [goal('round')] },
          { id: 'round', objectives: [goal('owed')] },
          { id: 'lost' },
        ],
      }),
      'records/sheet/watch.json': JSON.stringify({
        rows: [
          {
            id: 'a',
            when: { event: 'quests/done' },
            if: 'quests.reached(quest: debt, stage: hunted)',
            do: [{ effect: 'set-flag', flag: 'paid', to: true }],
          },
        ],
      }),
      'records/flag/paid.json': '{}',
    });
    // M3.10: a slot the quest lacks, a slot of a type nothing has, {x} naming no slot, and a job in
    // a game whose events have no time module.
    const slotted = await kitted(
      ['quests'],
      {
        'records/quest/bounty.json': JSON.stringify({
          name: 'Bounty',
          'at-start': true,
          slots: [{ id: 'mark', type: 'item', where: 'flag.on(paid)' }],
          stages: [
            {
              id: 'hunt',
              log: 'Find {who}.',
              objectives: [{ id: 'find', text: 'Find', 'done-when': 'flag.on(@who)' }],
            },
            { id: 'go', job: { takes: { days: 1 }, outcomes: [{ chance: 100, next: 'hunt' }] } },
          ],
        }),
        'records/flag/paid.json': '{}',
      },
      {},
      { facts: ENGINE_FACTS, events: ENGINE_EVENTS },
    );
    // M3.11: a scene outside the subset, one in a folder, a note beside them, a scene and a talk
    // record with one id, and a scene whose ways rule a branch out and can never end.
    const scened = await kitted(['dialogue'], {
      'scenes/bad.ink': 'VAR x = 1\nHi.',
      'scenes/old/a.ink': 'Hi.',
      'scenes/notes.md': '',
      'scenes/twice.ink': 'Hi.',
      'records/talk/twice.json': JSON.stringify({ starts: [{ line: 'a' }], lines: [{ id: 'a', text: 'A' }] }),
      'scenes/ways.ink': [
        'EXTERNAL flag_on(flag)',
        '{ flag_on("paid"):',
        '  { not flag_on("paid"): Never. }',
        '}',
        '-> round',
        '=== round ===',
        'Round again.',
        '-> round',
      ].join('\n'),
      'records/flag/paid.json': '{}',
    });
    // M4.1: a screen with a misspelt field, one that reads a fact and takes an action the game
    // lacks, a theme short of contrast, a note under ui/, and a mode no screen shows. M4.2: a
    // screen nothing closes, and feedback on an event the game lacks and an argument one lacks.
    const screened = await kitted(
      ['dialogue'],
      {
        'ui/bad.json': JSON.stringify({ main: { widget: 'text', txt: 'Hi' } }),
        'ui/hud.json': JSON.stringify({
          shows: ['play'],
          main: { widget: 'button', label: '{hold.count}', action: { take: 'hold/sail' } },
        }),
        'ui/theme.json': JSON.stringify({
          colors: {
            background: '#888888',
            surface: '#888888',
            text: '#777777',
            muted: '#777777',
            accent: '#888888',
            'on-accent': '#777777',
          },
        }),
        'ui/notes.md': '',
        'ui/map.json': JSON.stringify({ main: { widget: 'text', text: 'Map' } }),
        'ui/feedback.json': JSON.stringify({
          lines: [
            { on: 'hold/burned', say: 'Gone' },
            { on: 'hold/looted', say: '{.count} looted' },
          ],
        }),
      },
      {},
      {
        facts: ENGINE_FACTS,
        actions: ['hold/loot'],
        modes: ['play', 'talking'],
        events: { 'hold/looted': { args: { item: { type: 'text' } } } },
      },
    );
    // M4.6: a layered map whose six stations can't always fit, a drawn map with a node no road
    // reaches, and an enter-map at a node the map lacks.
    const kind = (id: string, more = {}) => ({
      [`records/node-kind/${id}.json`]: JSON.stringify({ name: id, ...more }),
    });
    const mapped = await kitted(['maps'], {
      ...kind('gate', { arrive: [{ effect: 'enter-map', map: 'valley', at: 'nowhere' }] }),
      ...kind('empty'),
      ...kind('station'),
      'records/map/sector.json': JSON.stringify({
        name: 'Sector',
        layers: {
          count: 7,
          widths: { min: 1, max: 2 },
          start: 'gate',
          end: 'gate',
          links: 'both',
          place: [{ kind: 'station', min: 6, max: 6 }],
          mix: [{ kind: 'empty', weight: 1 }],
        },
        moves: [{ id: 'jump', label: 'Jump' }],
      }),
      'records/map/valley.json': JSON.stringify({
        name: 'Valley',
        start: 'van',
        nodes: [
          { id: 'van', kind: 'empty', x: 0, y: 0 },
          { id: 'crag', kind: 'empty', x: 50, y: 50 },
        ],
        moves: [{ id: 'drive', label: 'Drive' }],
      }),
    });
    const results = [broken, duplicate, newer, invalid, conditions, types, assets, sheets, scripts, kits, needs];
    const late = [timed, drifting, rostered, evented, talked, quested, slotted, scened, screened, mapped];
    const seen = new Set([...results, ...late].flatMap((r) => r.diagnostics.map((d) => d.code)));
    // E031 and E032 come from running a game's scripts, which compiling never does; @eb/script's
    // tests fire them (load.test.ts).
    expect([...seen, 'E031', 'E032'].sort()).toEqual(Object.keys(DIAGNOSTIC_CODES).sort());
  });
});
