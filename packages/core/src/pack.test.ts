import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical.ts';
import { createPack, PACK_FORMAT, PackError, packHash, readPack } from './pack.ts';
import { createRecordStore } from './records.ts';
import { type PackWorld, worldDataOf } from './world/packWorld.ts';

const project = { id: 'salvage-run', name: 'Salvage Run', version: '0.1.0' };
const records = { item: { medkit: { name: 'Medkit', weight: 1 } }, actor: { rook: { name: 'Rook' } } };

/** A pack as it arrives from a file: parsed JSON, nothing shared with the original. */
const reloaded = (value: unknown): Record<string, unknown> => JSON.parse(canonicalJson(value));

describe('createPack', () => {
  it('hashes the format, project and records, whatever their key order', () => {
    const pack = createPack(project, records);
    // No scripts: format 1, which every engine since M1.4 reads, its hash what it always was.
    expect(pack.format).toBe(1);
    expect(pack).not.toHaveProperty('scripts');
    expect(pack.hash).toMatch(/^[0-9a-f]{16}$/);
    const reordered = createPack(
      { version: '0.1.0', name: 'Salvage Run', id: 'salvage-run' },
      { actor: { rook: { name: 'Rook' } }, item: { medkit: { weight: 1, name: 'Medkit' } } },
    );
    expect(reordered.hash).toBe(pack.hash);
  });

  it('changes the hash when any part changes', () => {
    const base = createPack(project, records).hash;
    expect(createPack({ ...project, version: '0.1.1' }, records).hash).not.toBe(base);
    expect(createPack(project, { ...records, item: { medkit: { name: 'Medkit', weight: 2 } } }).hash).not.toBe(base);
    expect(packHash({ format: 2, project, records })).not.toBe(base);
  });

  it('carries scripts as format 2, hashing them too (M3.2)', () => {
    const scripts = { game: 'exports.start = "play";' };
    const pack = createPack(project, records, scripts);
    expect(pack.format).toBe(2);
    expect(pack.scripts).toEqual(scripts);
    expect(pack.hash).not.toBe(createPack(project, records).hash);
    expect(createPack(project, records, { game: 'exports.start = "sail";' }).hash).not.toBe(pack.hash);
    // No scripts at all is a pack without them.
    expect(createPack(project, records, {})).toEqual(createPack(project, records));
  });

  it('carries the kits as format 3, scripts or none, hashing them too (M3.3)', () => {
    const kitted = createPack({ ...project, kits: ['inventory'] }, records);
    expect(kitted.format).toBe(3);
    expect(kitted.project.kits).toEqual(['inventory']);
    expect(kitted.scripts).toBeUndefined();
    expect(kitted.hash).not.toBe(createPack(project, records).hash);
    expect(createPack({ ...project, kits: ['inventory', 'economy'] }, records).hash).not.toBe(kitted.hash);
    const both = createPack({ ...project, kits: ['inventory'] }, records, { game: 'exports.start = "play";' });
    expect(both.format).toBe(3);
    expect(both.scripts).toEqual({ game: 'exports.start = "play";' });
    // No kits at all is the format a pack had before.
    expect(createPack({ ...project, kits: [] }, records)).toEqual(createPack(project, records));
  });

  it('carries the time kit’s calendar with the kits, and nowhere else (M3.5)', () => {
    const calendar = { ticksPerDay: 1, daysPerYear: 96 };
    const timed = createPack({ ...project, kits: ['time'], calendar }, records);
    expect(timed.project.calendar).toEqual(calendar);
    expect(timed.hash).not.toBe(createPack({ ...project, kits: ['time'] }, records).hash);
    // The calendar is the time kit's: with no kits, there is nothing to carry it.
    expect(createPack({ ...project, calendar }, records)).toEqual(createPack(project, records));
  });

  it('carries the screens as format 4, kits and scripts or none, hashing them too (M4.1)', () => {
    const ui = { screens: { hud: { main: { widget: 'text', text: 'Day {time.day}' } } } };
    const screened = createPack(project, records, undefined, ui);
    expect(screened.format).toBe(4);
    expect(screened.ui).toEqual(ui);
    expect(screened.project).toEqual(project);
    expect(screened.hash).not.toBe(createPack(project, records).hash);
    const themed = createPack(project, records, undefined, { ...ui, theme: { colors: {} } });
    expect(themed.ui?.theme).toEqual({ colors: {} });
    expect(themed.hash).not.toBe(screened.hash);
    const other = { screens: { hud: { main: { widget: 'text', text: 'Night' } } } };
    expect(createPack(project, records, undefined, other).hash).not.toBe(screened.hash);
    const all = createPack({ ...project, kits: ['time'], calendar: { ticksPerDay: 1 } }, records, { game: 'g' }, ui);
    expect(all.format).toBe(4);
    expect(all.project).toEqual({ ...project, kits: ['time'], calendar: { ticksPerDay: 1 } });
    expect(all.scripts).toEqual({ game: 'g' });
    // No screens at all is the format a pack had before, and a theme alone is no screen.
    expect(createPack(project, records, undefined, { screens: {} })).toEqual(createPack(project, records));
    expect(createPack(project, records, undefined, { screens: {}, theme: {} })).toEqual(createPack(project, records));
  });

  it('carries the feedback as format 5, screens or none, hashing it too (M4.2)', () => {
    const screens = { hud: { main: { widget: 'log' } } };
    const feedback = { lines: [{ on: 'inventory/gained', say: '{.item}' }] };
    const said = createPack(project, records, undefined, { screens, feedback });
    expect(said.format).toBe(5);
    expect(said.ui).toEqual({ screens, feedback });
    expect(said.hash).not.toBe(createPack(project, records, undefined, { screens }).hash);
    const reworded = { lines: [{ on: 'inventory/gained', say: 'Got {.item}' }] };
    expect(createPack(project, records, undefined, { screens, feedback: reworded }).hash).not.toBe(said.hash);
    // Feedback plays with the fallback where there are no screens, so it is packed without them too.
    expect(createPack(project, records, undefined, { screens: {}, feedback }).ui).toEqual({ screens: {}, feedback });
  });

  it('carries the shell as format 6, feedback and screens or none, hashing it too (M4.3)', () => {
    const screens = { hud: { main: { widget: 'log' } } };
    const shell = { title: 'The Hut', slots: 2 };
    const shelled = createPack(project, records, undefined, { screens, shell });
    expect(shelled.format).toBe(6);
    expect(shelled.ui).toEqual({ screens, shell });
    expect(shelled.hash).not.toBe(createPack(project, records, undefined, { screens }).hash);
    expect(createPack(project, records, undefined, { screens, shell: { ...shell, slots: 3 } }).hash).not.toBe(
      shelled.hash,
    );
    const feedback = { lines: [{ on: 'inventory/gained', say: '{.item}' }] };
    expect(createPack(project, records, undefined, { screens: {}, feedback, shell }).ui).toEqual({
      screens: {},
      feedback,
      shell,
    });
  });

  it('carries the assets\u2019 credits as format 7, sorted by asset, ui or none, hashing them too (M4.4)', () => {
    const screens = { hud: { main: { widget: 'log' } } };
    const rope = { asset: 'rope.png', licence: 'CC-BY-4.0', licenceName: 'CC BY 4.0', source: 'x', author: 'Ana' };
    const axe = { asset: 'axe.png', licence: 'own', licenceName: 'Own work', source: 'Drawn here' };
    const credited = createPack(project, records, undefined, { screens }, [rope, axe]);
    expect(credited.format).toBe(7);
    expect(credited.credits).toEqual([axe, rope]);
    expect(credited.ui).toEqual({ screens });
    expect(createPack(project, records, undefined, { screens }, [axe, rope]).hash).toBe(credited.hash);
    expect(createPack(project, records, undefined, { screens }, [rope, { ...axe, author: 'Bo' }]).hash).not.toBe(
      credited.hash,
    );
    // No credits, no format 7: the hash stays what it was.
    expect(createPack(project, records, undefined, { screens }, []).format).toBe(4);
    expect(createPack(project, records, undefined, undefined, [axe])).not.toHaveProperty('ui');
  });

  it('carries the audio files music names as format 8, credits or none, hashing them too (M4.8)', () => {
    const screens = { hut: { main: { widget: 'log' } } };
    const audio = { 'audio/theme.wav': 'UklGRiQAAABXQVZF' };
    const sounded = createPack(project, records, undefined, { screens }, undefined, audio);
    expect(sounded.format).toBe(8);
    expect(sounded.audio).toEqual(audio);
    expect(sounded).not.toHaveProperty('credits');
    expect(readPack(reloaded(sounded))).toEqual(sounded);
    const credit = { asset: 'audio/theme.wav', licence: 'own', licenceName: 'Own work', source: 'Made here' };
    expect(readPack(reloaded(createPack(project, records, undefined, { screens }, [credit], audio))).credits).toEqual([
      credit,
    ]);
    expect(
      createPack(project, records, undefined, { screens }, undefined, { 'audio/theme.wav': 'UklGRiQ' }).hash,
    ).not.toBe(sounded.hash);
    // No audio, no format 8: the hash stays what it was.
    expect(createPack(project, records, undefined, { screens }, undefined, {}).format).toBe(4);
    expect(() => readPack({ ...reloaded(sounded), audio: {} })).toThrow('A format 8 pack has no audio');
    expect(() => readPack({ ...reloaded(sounded), audio: { 'audio/theme.wav': 'not base64!' } })).toThrow(
      'is not base64',
    );
  });

  it('carries the spaces as format 9, audio or none, hashing them too (M5.8)', () => {
    const zone = {
      when: { not: { fact: 'flag.on', args: { flag: 'cairn-seen' } } },
      effects: [{ effect: 'set-flag', flag: 'cairn-seen', to: true }],
      once: true,
    };
    const world = {
      spaces: { trailhead: { name: 'Trailhead', objects: [] } },
      prefabs: { cairn: { name: 'Cairn', objects: [] } },
      triggers: { trailhead: { 'cairn/zone': zone } },
      files: { 'spaces/trailhead.heights.png': 'iVBORw0K' },
      records: { 'model:crate': { file: 'crate.glb' } },
      fields: { prop: 'model' },
    };
    const walked = createPack(project, records, undefined, undefined, undefined, undefined, world);
    expect(walked.format).toBe(9);
    expect(walked.world).toEqual(world);
    expect(walked).not.toHaveProperty('audio');
    expect(readPack(reloaded(walked))).toEqual(walked);
    const audio = { 'audio/theme.wav': 'UklGRiQAAABXQVZF' };
    expect(
      readPack(reloaded(createPack(project, records, undefined, undefined, undefined, audio, world))).audio,
    ).toEqual(audio);
    const moved = { ...world, files: { 'spaces/trailhead.heights.png': 'iVBORw0L' } };
    expect(createPack(project, records, undefined, undefined, undefined, undefined, moved).hash).not.toBe(walked.hash);
    // No spaces, no format 9: the hash stays what it was.
    expect(createPack(project, records, undefined, undefined, undefined, undefined, { ...world, spaces: {} })).toEqual(
      createPack(project, records),
    );
    const broken = (change: Record<string, unknown>) => () =>
      readPack({ ...reloaded(walked), world: { ...world, ...change } });
    expect(() => readPack({ ...reloaded(walked), world: undefined })).toThrow('A format 9 pack has no world');
    expect(broken({ spaces: {} })).toThrow('A format 9 pack has no spaces');
    expect(broken({ spaces: { Trailhead: {} } })).toThrow('"Trailhead" is not a valid space or prefab name');
    expect(broken({ prefabs: { cairn: 'a cairn' } })).toThrow("The pack's prefabs are not objects");
    expect(broken({ triggers: { bothy: {} } })).toThrow('Trigger zones of a space the pack lacks: "bothy"');
    expect(broken({ triggers: { trailhead: { 'cairn//zone': zone } } })).toThrow(
      '"cairn//zone" is not an object\'s path',
    );
    expect(broken({ triggers: { trailhead: { cairn: { when: zone.when } } } })).toThrow(
      'The trigger zone "trailhead/cairn" has no effects',
    );
    expect(broken({ triggers: { trailhead: { cairn: { ...zone, once: 'yes' } } } })).toThrow(
      'once is not true or false',
    );
    expect(broken({ triggers: { trailhead: { cairn: { ...zone, size: 2 } } } })).toThrow(
      'Unknown trigger zone fields: size',
    );
    expect(broken({ files: { 'a.png': 'not base64!' } })).toThrow("The pack's world files are not base64");
    expect(broken({ sky: {} })).toThrow('Unknown pack world fields: sky');
    expect(broken({ records: { crate: {} } })).toThrow('"crate" is not a record\'s type and id');
    expect(broken({ fields: { prop: 3 } })).toThrow("The pack's model fields are not text");
    // Before format 9 there is no world to carry, and before format 10 no uses, spawns or start.
    expect(() => readPack({ ...reloaded(createPack(project, records)), world })).toThrow('Unknown pack fields: world');
    expect(broken({ start: 'trailhead' })).toThrow('Unknown pack world fields: start');
  });

  it('reads a format 9 world as the module needs it: no uses, no spawn points, its first space the start', () => {
    const world = {
      spaces: { trailhead: { name: 'Trailhead', objects: [] }, bothy: { name: 'Bothy', objects: [] } },
      prefabs: {},
      triggers: {},
      files: {},
      records: {},
      fields: {},
    };
    expect(worldDataOf(world)).toEqual({
      triggers: {},
      uses: {},
      spawns: { bothy: [], trailhead: [] },
      start: 'bothy',
      actors: {},
    });
  });

  it('carries the uses, spawn points and start as format 10 (M5.9)', () => {
    const world = {
      spaces: { trailhead: { name: 'Trailhead', objects: [] }, bothy: { name: 'Bothy', objects: [] } },
      prefabs: {},
      triggers: {},
      files: {},
      records: {},
      fields: {},
      uses: { trailhead: { 'bothy/door': { label: 'Open', effects: [{ effect: 'enter-space', space: 'bothy' }] } } },
      spawns: { trailhead: ['car-park'], bothy: [] },
      start: 'trailhead',
    };
    const placed = createPack(project, records, undefined, undefined, undefined, undefined, world);
    expect(placed.format).toBe(10);
    expect(readPack(reloaded(placed))).toEqual(placed);
    const moved = { ...world, start: 'bothy' };
    expect(createPack(project, records, undefined, undefined, undefined, undefined, moved).hash).not.toBe(placed.hash);
    // No uses, no spawn points and the first space the start: format 9 holds it, and it stays format 9.
    const plain = { ...world, uses: { trailhead: {} }, spawns: { trailhead: [], bothy: [] }, start: 'bothy' };
    const nine = createPack(project, records, undefined, undefined, undefined, undefined, plain);
    expect(nine.format).toBe(9);
    expect(nine.world).not.toHaveProperty('start');
    expect(
      createPack(project, records, undefined, undefined, undefined, undefined, { ...plain, start: 'trailhead' }).format,
    ).toBe(10);
    expect(
      createPack(project, records, undefined, undefined, undefined, undefined, { ...plain, spawns: world.spawns })
        .format,
    ).toBe(10);
    const broken = (change: Record<string, unknown>) => () =>
      readPack({ ...reloaded(placed), world: { ...world, ...change } });
    const door = world.uses.trailhead['bothy/door'];
    expect(broken({ uses: { trailhead: 'a door' } })).toThrow("The pack's uses are not objects");
    expect(broken({ uses: { moor: {} } })).toThrow('Uses of a space the pack lacks: "moor"');
    expect(broken({ uses: { trailhead: { 'Bothy/door': door } } })).toThrow('"Bothy/door" is not an object\'s path');
    expect(broken({ uses: { trailhead: { door: { effects: [] } } } })).toThrow(
      'The use "trailhead/door" has no label or no effects',
    );
    expect(broken({ uses: { trailhead: { door: { ...door, reach: 2 } } } })).toThrow('Unknown use fields: reach');
    expect(broken({ uses: { trailhead: { door: { ...door, takes: 1 } } } })).toThrow(
      'The use "trailhead/door"\'s takes is not true or false',
    );
    expect(broken({ spawns: { trailhead: ['car park'], bothy: [] } })).toThrow(
      "The pack's spawn points are not lists of object paths",
    );
    expect(broken({ spawns: { trailhead: [] } })).toThrow('The pack lists no spawn points for "bothy"');
    expect(broken({ start: 'moor' })).toThrow("The pack's start is not one of its spaces");
    expect(broken({ start: undefined })).toThrow("The pack's start is not one of its spaces");
  });

  it('carries the navmeshes and the actors placed as format 11 (M6.2), and only with a navmesh', () => {
    const world = {
      spaces: { square: { name: 'Square', objects: [] }, inn: { name: 'Inn', objects: [] } },
      prefabs: {},
      triggers: {},
      files: {},
      records: {},
      fields: {},
      uses: {},
      spawns: { square: ['gate'], inn: [] },
      start: 'square',
      navmeshes: { square: 'RUJOVg==' },
      actors: { carter: { space: 'square', path: 'carter' }, keeper: { space: 'inn', path: 'bar/keeper' } },
    };
    const walked = createPack(project, records, undefined, undefined, undefined, undefined, world);
    expect(walked.format).toBe(11);
    expect(readPack(reloaded(walked))).toEqual(walked);
    expect(worldDataOf(walked.world as PackWorld).actors).toEqual(world.actors);
    // No navmesh, nobody walks: format 10 holds it, actors and all left out, so its hash stays M5.9's.
    const still = createPack(project, records, undefined, undefined, undefined, undefined, { ...world, navmeshes: {} });
    expect(still.format).toBe(10);
    expect(still.world).not.toHaveProperty('actors');
    expect(still.world).not.toHaveProperty('navmeshes');
    const broken = (change: Record<string, unknown>) => () =>
      readPack({ ...reloaded(walked), world: { ...world, ...change } });
    expect(broken({ navmeshes: {} })).toThrow('A format 11 pack has no navmeshes, or one that is not base64');
    expect(broken({ navmeshes: { square: 'not base64!' } })).toThrow(
      'A format 11 pack has no navmeshes, or one that is not base64',
    );
    expect(broken({ navmeshes: { moor: 'RUJOVg==' } })).toThrow('A navmesh of a space the pack lacks: "moor"');
    const placed = "The pack's actors are not each a space it has and an object's path";
    expect(broken({ actors: { carter: { space: 'moor', path: 'carter' } } })).toThrow(placed);
    expect(broken({ actors: { carter: { space: 'square', path: 'Carter' } } })).toThrow(placed);
    expect(broken({ actors: { carter: { space: 'square', path: 'carter', yaw: 3 } } })).toThrow(placed);
    expect(broken({ actors: { Carter: { space: 'square', path: 'carter' } } })).toThrow(
      '"Carter" is not a valid actor',
    );
    // Before format 11 there are no navmeshes.
    const ten = reloaded(still);
    expect(() => readPack({ ...ten, world: { ...(ten.world as object), navmeshes: world.navmeshes } })).toThrow(
      'Unknown pack world fields: navmeshes',
    );
  });

  it('carries the clock as format 12 (M6.3), only with the time kit and spaces, navmeshes or none', () => {
    const world = {
      spaces: { green: { name: 'Green', objects: [] } },
      prefabs: {},
      triggers: {},
      files: {},
      records: {},
      fields: {},
      uses: {},
      spawns: { green: [] },
      start: 'green',
    };
    const timed = { ...project, kits: ['time'], calendar: { ticksPerDay: 1440 }, clock: { rate: 20 } };
    const clocked = createPack(timed, records, undefined, undefined, undefined, undefined, world);
    expect(clocked.format).toBe(12);
    expect(clocked.project.clock).toEqual({ rate: 20 });
    // Format 12 keeps format 11's navmeshes and actors, none here, so a clocked world has one shape.
    expect(clocked.world).toMatchObject({ navmeshes: {}, actors: {} });
    expect(readPack(reloaded(clocked))).toEqual(clocked);
    expect(
      createPack({ ...timed, clock: { rate: 60 } }, records, undefined, undefined, undefined, undefined, world).hash,
    ).not.toBe(clocked.hash);
    // Without spaces nothing walks, and without the time kit nothing keeps time: no clock, an older format.
    expect(createPack(timed, records).format).toBe(3);
    expect(createPack(timed, records).project).not.toHaveProperty('clock');
    const untimed = { ...timed, kits: ['inventory'] };
    const nine = createPack(untimed, records, undefined, undefined, undefined, undefined, world);
    expect(nine.format).toBe(9);
    expect(nine.project).not.toHaveProperty('clock');
    const read = reloaded(clocked);
    const broken =
      (clock: unknown, also: Record<string, unknown> = {}) =>
      () =>
        readPack({ ...read, project: { ...(read.project as object), clock, ...also } });
    expect(broken(undefined)).toThrow('A format 12 pack has a clock');
    expect(broken({ rate: 0 })).toThrow(
      "The pack's clock runs at a whole number of game seconds a second, from 1 to 3600",
    );
    expect(broken({ rate: 2.5 })).toThrow('from 1 to 3600');
    expect(broken({ rate: 20, pace: 1 })).toThrow('Unknown pack clock fields: pace');
    expect(broken({ rate: 7 })).toThrow("At 7x, the pack's calendar's ticks aren't whole real milliseconds");
    expect(broken({ rate: 20 }, { kits: ['inventory'], calendar: undefined })).toThrow(
      "A pack's clock is the time kit's, which it doesn't list",
    );
    // Before format 12 there is no clock.
    const eleven = reloaded(nine);
    expect(() => readPack({ ...eleven, project: { ...(eleven.project as object), clock: { rate: 20 } } })).toThrow(
      'Unknown pack project fields: clock',
    );
  });

  it('carries the fighting as format 13 (M6.4), only with the fighting kit and spaces, clock or none', () => {
    const world = {
      spaces: { camp: { name: 'Camp', objects: [] } },
      prefabs: {},
      triggers: {},
      files: {},
      records: {},
      fields: {},
      uses: {},
      spawns: { camp: [] },
      start: 'camp',
    };
    const fighting = { player: 'hero', combat: 'blades' };
    const armed = { ...project, kits: ['stats', 'fighting'], fighting };
    const fought = createPack(armed, records, undefined, undefined, undefined, undefined, world);
    expect(fought.format).toBe(13);
    expect(fought.project.fighting).toEqual(fighting);
    expect(fought.project).not.toHaveProperty('clock');
    expect(fought.world).toMatchObject({ navmeshes: {}, actors: {} });
    expect(readPack(reloaded(fought))).toEqual(fought);
    const timed = { ...armed, kits: ['time', 'fighting'], clock: { rate: 20 } };
    const both = createPack(timed, records, undefined, undefined, undefined, undefined, world);
    expect(both.format).toBe(13);
    expect(both.project).toMatchObject({ clock: { rate: 20 }, fighting });
    expect(readPack(reloaded(both))).toEqual(both);
    // Without spaces nothing is fought, and without the kit nothing reads it: no fighting, an older format.
    expect(createPack(armed, records).format).toBe(3);
    expect(createPack(armed, records).project).not.toHaveProperty('fighting');
    const unarmed = createPack(
      { ...armed, kits: ['stats'] },
      records,
      undefined,
      undefined,
      undefined,
      undefined,
      world,
    );
    expect(unarmed.format).toBe(9);
    const read = reloaded(fought);
    const broken =
      (given: unknown, also: Record<string, unknown> = {}) =>
      () =>
        readPack({ ...read, project: { ...(read.project as object), fighting: given, ...also } });
    expect(broken(undefined)).toThrow('A format 13 pack has its fighting');
    expect(broken({ player: 'Hero', combat: 'blades' })).toThrow('names its player and its combat record by id');
    expect(broken({ ...fighting, aim: 1 })).toThrow('Unknown pack fighting fields: aim');
    expect(broken(fighting, { kits: ['stats'] })).toThrow(
      "A pack's fighting is the fighting kit's, which it doesn't list",
    );
    // Before format 13 there is no fighting.
    const nine = reloaded(unarmed);
    expect(() => readPack({ ...nine, project: { ...(nine.project as object), fighting } })).toThrow(
      'Unknown pack project fields: fighting',
    );
  });
});

describe('readPack', () => {
  it('accepts a pack that went through a file, and the store reads it', () => {
    const pack = readPack(reloaded(createPack(project, records)));
    expect(createRecordStore(pack.records).getOrThrow('item', 'medkit')).toEqual({ name: 'Medkit', weight: 1 });
  });

  it('rejects a pack whose content no longer matches its hash', () => {
    const pack = reloaded(createPack(project, records));
    (pack.records as { item: { medkit: { weight: number } } }).item.medkit.weight = 5;
    expect(() => readPack(pack)).toThrow(/^The pack's hash is [0-9a-f]{16}, but its content hashes to [0-9a-f]{16}$/);
  });

  it('reads a format 2 pack and its scripts', () => {
    const pack = readPack(reloaded(createPack(project, records, { game: 'exports.start = "play";' })));
    expect(pack.format).toBe(2);
    expect(pack.scripts).toEqual({ game: 'exports.start = "play";' });
  });

  it('reads a format 3 pack, with its kits and with or without scripts', () => {
    const kitted = readPack(reloaded(createPack({ ...project, kits: ['inventory', 'economy'] }, records)));
    expect(kitted.format).toBe(3);
    expect(kitted.project.kits).toEqual(['inventory', 'economy']);
    const both = readPack(reloaded(createPack({ ...project, kits: ['inventory'] }, records, { game: 'x' })));
    expect(both.scripts).toEqual({ game: 'x' });
  });

  it('reads a calendar beside the time kit, and refuses one without it, or one that doesn’t hold together', () => {
    const timed = reloaded(createPack({ ...project, kits: ['time'], calendar: { ticksPerDay: 24 } }, records));
    expect(readPack(timed).project.calendar).toEqual({ ticksPerDay: 24 });
    const kitted = reloaded(createPack({ ...project, kits: ['inventory'] }, records));
    expect(() =>
      readPack({ ...kitted, project: { ...project, kits: ['inventory'], calendar: { ticksPerDay: 24 } } }),
    ).toThrow("A pack's calendar is the time kit's, which it doesn't list");
    expect(() => readPack({ ...timed, project: { ...project, kits: ['time'], calendar: { ticksPerDay: 0 } } })).toThrow(
      "The pack's calendar: Calendar: ticksPerDay must be a whole number, at least 1",
    );
  });

  it('refuses kits outside format 3, and a format 3 pack without them', () => {
    const plain = reloaded(createPack(project, records));
    expect(() => readPack({ ...plain, project: { ...project, kits: ['inventory'] } })).toThrow(
      'Unknown pack project fields: kits',
    );
    expect(() => readPack({ ...plain, format: 3 })).toThrow('A format 3 pack lists its kits');
  });

  it('reads a format 4 pack, its screens and theme, with or without kits and scripts', () => {
    const ui = { screens: { hud: { main: { widget: 'text', text: 'Hi' } } }, theme: { colors: {} } };
    const plain = readPack(reloaded(createPack(project, records, undefined, ui)));
    expect(plain.format).toBe(4);
    expect(plain.ui).toEqual(ui);
    expect(plain.project.kits).toBeUndefined();
    const all = readPack(reloaded(createPack({ ...project, kits: ['inventory'] }, records, { game: 'x' }, ui)));
    expect(all.project.kits).toEqual(['inventory']);
    expect(all.scripts).toEqual({ game: 'x' });
  });

  it('refuses screens outside format 4, and a format 4 pack without them', () => {
    const screened = reloaded(createPack(project, records, undefined, { screens: { hud: {} } }));
    const kitted = reloaded(createPack({ ...project, kits: ['inventory'] }, records));
    expect(() => readPack({ ...kitted, ui: screened.ui })).toThrow('Unknown pack fields: ui');
    expect(() => readPack({ ...screened, ui: undefined })).toThrow('A format 4 pack has no screens');
    expect(() => readPack({ ...screened, ui: { screens: {} } })).toThrow('A format 4 pack has no screens');
    expect(() => readPack({ ...screened, ui: { screens: { hud: {} }, extra: 1 } })).toThrow(
      'Unknown pack ui fields: extra',
    );
    expect(() => readPack({ ...screened, ui: { screens: { Hud: {} } } })).toThrow('"Hud" is not a valid screen name');
    expect(() => readPack({ ...screened, ui: { screens: { hud: [] } } })).toThrow(
      'The pack\'s screen "hud" is not an object',
    );
    expect(() => readPack({ ...screened, ui: { screens: { hud: {} }, theme: 'dark' } })).toThrow(
      "The pack's theme is not an object",
    );
    expect(() => readPack({ ...screened, project: { ...project, kits: [] } })).toThrow(
      'A format 4 pack with kits lists them',
    );
  });

  it('reads a format 5 pack and its feedback, with screens or none', () => {
    const feedback = { lines: [{ on: 'inventory/gained', say: '{.item}' }] };
    const ui = { screens: { hud: { main: { widget: 'log' } } }, feedback };
    const pack = readPack(reloaded(createPack({ ...project, kits: ['inventory'] }, records, undefined, ui)));
    expect(pack.format).toBe(5);
    expect(pack.ui).toEqual(ui);
    expect(readPack(reloaded(createPack(project, records, undefined, { screens: {}, feedback }))).ui).toEqual({
      screens: {},
      feedback,
    });
  });

  it('refuses feedback outside format 5, and a format 5 pack without it', () => {
    const screened = reloaded(createPack(project, records, undefined, { screens: { hud: {} } }));
    const feedback = { lines: [] };
    const said = reloaded(createPack(project, records, undefined, { screens: { hud: {} }, feedback }));
    expect(() => readPack({ ...screened, ui: { screens: { hud: {} }, feedback } })).toThrow(
      'Unknown pack ui fields: feedback',
    );
    expect(() => readPack({ ...said, ui: undefined })).toThrow('A format 5 pack has no feedback');
    expect(() => readPack({ ...said, ui: { screens: { hud: {} } } })).toThrow('A format 5 pack has no feedback');
    expect(() => readPack({ ...said, ui: { screens: { hud: {} }, feedback: { lines: {} } } })).toThrow(
      'A format 5 pack has no feedback',
    );
    expect(() => readPack({ ...said, ui: { feedback } })).toThrow('A format 5 pack has no screens');
  });

  it('reads a format 6 pack and its shell, with feedback or none, and refuses a shell elsewhere', () => {
    const shell = { title: 'The Hut', daily: true };
    const feedback = { lines: [{ on: 'inventory/gained', say: '{.item}' }] };
    const ui = { screens: { hud: { main: { widget: 'log' } } }, shell };
    const pack = readPack(reloaded(createPack(project, records, undefined, ui)));
    expect(pack.format).toBe(6);
    expect(pack.ui).toEqual(ui);
    expect(readPack(reloaded(createPack(project, records, undefined, { ...ui, feedback }))).ui).toEqual({
      ...ui,
      feedback,
    });
    const shelled = reloaded(createPack(project, records, undefined, ui));
    const said = reloaded(createPack(project, records, undefined, { screens: {}, feedback }));
    expect(() => readPack({ ...said, ui: { screens: {}, feedback, shell } })).toThrow('Unknown pack ui fields: shell');
    expect(() => readPack({ ...shelled, ui: undefined })).toThrow('A format 6 pack has no shell');
    expect(() => readPack({ ...shelled, ui: { screens: {} } })).toThrow('A format 6 pack has no shell');
    expect(() => readPack({ ...shelled, ui: { screens: {}, shell: 'big' } })).toThrow('A format 6 pack has no shell');
    expect(() => readPack({ ...shelled, ui: { screens: {}, shell, feedback: { lines: 1 } } })).toThrow(
      'A format 6 pack has no feedback',
    );
  });

  it('reads a format 7 pack and its credits, with ui or none, and refuses credits elsewhere', () => {
    const credit = { asset: 'rope.png', licence: 'CC-BY-4.0', licenceName: 'CC BY 4.0', source: 'x', author: 'Ana' };
    const ui = { screens: { hud: { main: { widget: 'log' } } } };
    const pack = readPack(reloaded(createPack(project, records, undefined, ui, [credit])));
    expect(pack.format).toBe(7);
    expect(pack.credits).toEqual([credit]);
    expect(pack.ui).toEqual(ui);
    expect(readPack(reloaded(createPack(project, records, undefined, undefined, [credit]))).ui).toBeUndefined();
    const credited = reloaded(createPack(project, records, undefined, ui, [credit]));
    const shelled = reloaded(createPack(project, records, undefined, { ...ui, shell: {} }));
    expect(() => readPack({ ...shelled, credits: [credit] })).toThrow('Unknown pack fields: credits');
    expect(() => readPack({ ...credited, credits: [] })).toThrow('A format 7 pack has no credits');
    expect(() => readPack({ ...credited, credits: undefined })).toThrow('A format 7 pack has no credits');
    expect(() => readPack({ ...credited, credits: [{ ...credit, licence: 4 }] })).toThrow(
      "A pack's credit has no licence",
    );
    expect(() => readPack({ ...credited, credits: [{ ...credit, prompt: 'p' }] })).toThrow(
      'Unknown pack credit fields: prompt',
    );
    expect(() => readPack({ ...credited, ui: { screens: {}, shell: 'big' } })).toThrow('A format 7 pack has no shell');
  });

  it('asks for a newer engine when the format is newer', () => {
    expect(() => readPack({ ...reloaded(createPack(project, records)), format: PACK_FORMAT + 1 })).toThrow(
      `This pack is format ${PACK_FORMAT + 1}; this engine reads formats 1 to ${PACK_FORMAT}. Update the engine.`,
    );
  });

  it.each([
    ['not an object', [], 'A pack must be a JSON object'],
    ['an unknown format', { format: 'one' }, 'Unknown pack format: "one"'],
    ['an extra field', { extra: true }, 'Unknown pack fields: extra'],
    ['no project', { project: null }, 'The pack has no project'],
    ['an extra project field', { project: { ...project, author: 'x' } }, 'Unknown pack project fields: author'],
    [
      'a project without a valid id',
      { project: { ...project, id: 'Salvage Run' } },
      'The pack project has no valid id',
    ],
    ['a project without a version', { project: { id: 'x', name: 'X' } }, 'The pack project has no version'],
    ['records that are a list', { records: [] }, 'The pack has no records'],
    ['an invalid type name', { records: { Item: {} } }, '"Item" is not a valid record type name'],
    ['a type that is not an object', { records: { item: [] } }, "The pack's item records are not an object"],
    ['an invalid id', { records: { item: { 'Big Gun': {} } } }, '"item:Big Gun" does not have a valid record id'],
    ['no hash', { hash: 5 }, 'The pack has no hash'],
    ['scripts in a format 1 pack', { scripts: { game: '' } }, 'Unknown pack fields: scripts'],
    ['a format 2 pack without scripts', { format: 2 }, 'A format 2 pack has no scripts'],
    ['a format 2 pack with none in its scripts', { format: 2, scripts: {} }, 'A format 2 pack has no scripts'],
    ['a script with a bad name', { format: 2, scripts: { Game: '' } }, '"Game" is not a valid script name'],
    ['a script that is not text', { format: 2, scripts: { game: 1 } }, 'The pack\'s script "game" is not text'],
  ])('rejects %s', (_name, change, message) => {
    const pack = Array.isArray(change) ? change : { ...reloaded(createPack(project, records)), ...change };
    expect(() => readPack(pack)).toThrow(new PackError(message));
  });
});
