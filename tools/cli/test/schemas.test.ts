import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIELD_KINDS } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { getLanguageService, TextDocument } from 'vscode-json-languageservice';
import { FIXTURE_LUDUS } from '../../../packages/compiler/test/fixture.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const LUDUS_HASH = '34035cc3fb5fba7a';
const SETTINGS = '.vscode/settings.json';
const SCHEMAS = '.vscode/eb-schemas';

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

/** A copy of the ludus fixture in a scratch folder, with files changed or added. */
function ludus(changes: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'eb-schemas-'));
  cpSync(FIXTURE_LUDUS, dir, { recursive: true });
  for (const [path, content] of Object.entries(changes)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

/** The ludus fixture's records and project.json, with no types/. */
function bare(changes: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'eb-schemas-'));
  cpSync(join(FIXTURE_LUDUS, 'project.json'), join(dir, 'project.json'));
  cpSync(join(FIXTURE_LUDUS, 'records'), join(dir, 'records'), { recursive: true });
  for (const [path, content] of Object.entries(changes)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const read = (dir: string, path: string) => readFileSync(join(dir, path), 'utf8');
const entry = (type: string) => ({ fileMatch: [`**/records/${type}/*.json`], url: `./${SCHEMAS}/${type}.json` });
const TYPE_FILES = { fileMatch: ['**/types/*.json'], url: `./${SCHEMAS}/_type-file.json` };
const LUDUS_ENTRIES = [TYPE_FILES, ...['gladiator', 'school', 'weapon'].map(entry)];
const WROTE = `Wrote the schemas of type files and of 3 record types (gladiator, school, weapon) to ${SCHEMAS}/`;
const NO_TYPE =
  'No schema for the records of gladiator, school, weapon: no type defines them. Pass --types <module>, or add types/<type>.json.';

/** Every file under .vscode, by path, to compare one run with the next. */
function vscodeFiles(dir: string): Record<string, string> {
  const root = join(dir, '.vscode');
  const files: Record<string, string> = {};
  for (const found of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (found.isFile()) {
      const full = join(found.parentPath, found.name);
      files[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf8');
    }
  }
  return files;
}

describe('eb schemas', () => {
  it("writes each type's schema and maps its records to it, where the compiler doesn't look", () => {
    const dir = ludus();
    expect(eb(['schemas', dir])).toEqual({
      code: 0,
      out: `${WROTE} and mapped them in ${SETTINGS}.\n`,
      err: '',
    });
    expect(readdirSync(join(dir, SCHEMAS))).toEqual([
      '_type-file.json',
      'gladiator.json',
      'school.json',
      'weapon.json',
    ]);
    expect(JSON.parse(read(dir, `${SCHEMAS}/_type-file.json`))).toMatchObject({ $id: 'urn:eb:type-file' });
    expect(JSON.parse(read(dir, `${SCHEMAS}/school.json`))).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'urn:eb:record:school',
      title: 'School',
      additionalProperties: false,
    });
    expect(read(dir, SETTINGS)).toBe(`${JSON.stringify({ 'json.schemas': LUDUS_ENTRIES }, null, 2)}\n`);
    expect(eb(['validate', dir]).out).toBe(`8 records: no problems, hash ${LUDUS_HASH}.\n`);
  });

  it('keeps the other settings and schemas, in their indentation, and replaces its own', () => {
    const foo = { fileMatch: ['*.foo.json'], url: './foo.schema.json' };
    const settings = { 'editor.tabSize': 4, 'json.schemas': [entry('horse'), foo] };
    const dir = ludus({ [SETTINGS]: JSON.stringify(settings, null, 4) });
    expect(eb(['schemas', dir]).code).toBe(0);
    const text = read(dir, SETTINGS);
    expect(JSON.parse(text)).toEqual({ 'editor.tabSize': 4, 'json.schemas': [foo, ...LUDUS_ENTRIES] });
    expect(text.startsWith('{\n    "editor.tabSize": 4,\n')).toBe(true);
  });

  it('removes the schemas of types the project no longer has, and nothing else there', () => {
    const dir = ludus({ [`${SCHEMAS}/horse.json`]: '{}', [`${SCHEMAS}/notes.md`]: 'Mine.' });
    const run = eb(['schemas', dir]);
    expect(run.out).toContain(`Removed ${SCHEMAS}/horse.json: the project has no type horse now.\n`);
    expect(readdirSync(join(dir, SCHEMAS))).toEqual([
      '_type-file.json',
      'gladiator.json',
      'notes.md',
      'school.json',
      'weapon.json',
    ]);
  });

  it('takes out its schemas and entries when the types are gone, keeping the other settings', () => {
    const dir = ludus({ [SETTINGS]: JSON.stringify({ 'editor.tabSize': 4 }) });
    eb(['schemas', dir]);
    rmSync(join(dir, 'types'), { recursive: true });
    expect(eb(['schemas', dir]).out).toBe(
      [
        `No record types, so no schemas; took eb's entries out of ${SETTINGS}.`,
        `Removed ${SCHEMAS}/_type-file.json: the project has no type files now.`,
        `Removed ${SCHEMAS}/gladiator.json: the project has no type gladiator now.`,
        `Removed ${SCHEMAS}/school.json: the project has no type school now.`,
        `Removed ${SCHEMAS}/weapon.json: the project has no type weapon now.`,
        NO_TYPE,
        '',
      ].join('\n'),
    );
    expect(JSON.parse(read(dir, SETTINGS))).toEqual({ 'editor.tabSize': 4, 'json.schemas': [] });
    expect(readdirSync(join(dir, SCHEMAS))).toEqual([]);
  });

  it('changes nothing when run again', () => {
    const dir = ludus();
    eb(['schemas', dir]);
    const first = vscodeFiles(dir);
    expect(eb(['schemas', dir]).out).toBe(`${WROTE}; ${SETTINGS} already maps them.\n`);
    expect(vscodeFiles(dir)).toEqual(first);
  });

  it('skips a type whose file has problems, and says why', () => {
    const dir = ludus({ 'types/weapon.json': '{ "title": "Weapon", "fields": { "name": { "kind": "nope" } } }' });
    const run = eb(['schemas', dir]);
    expect(run.code).toBe(0);
    expect(run.out).toContain(
      'No schema for weapon: types/weapon.json has problems (E015 Expected a kind: text, int, number, bool, enum, ref, list, map, group, colour, asset, condition). Fix it, then run eb schemas again.\n',
    );
    expect(readdirSync(join(dir, SCHEMAS))).toEqual(['_type-file.json', 'gladiator.json', 'school.json']);
    expect(JSON.parse(read(dir, SETTINGS))['json.schemas']).toEqual([TYPE_FILES, entry('gladiator'), entry('school')]);
  });

  it('says which records no type defines, and writes nothing when no type does', () => {
    const dir = bare();
    expect(eb(['schemas', dir]).out).toBe(['No record types, so no schemas.', NO_TYPE, ''].join('\n'));
    expect(existsSync(join(dir, '.vscode'))).toBe(false);
  });

  it("leaves settings as they are when it has nothing to map and they map nothing of eb's", () => {
    const mine = '{\n    "editor.tabSize": 4\n}\n';
    const dir = bare({ [SETTINGS]: mine });
    expect(eb(['schemas', dir]).code).toBe(0);
    expect(read(dir, SETTINGS)).toBe(mine);
    expect(existsSync(join(dir, SCHEMAS))).toBe(false);
  });

  it('leaves settings with comments as they are, writes nothing, and prints what to add', () => {
    const mine = '{\n  // Mine.\n  "editor.tabSize": 4\n}\n';
    const dir = ludus({ [SETTINGS]: mine });
    const run = eb(['schemas', dir]);
    expect(run.code).toBe(2);
    expect(run.out).toBe('');
    expect(run.err).toContain(
      `${SETTINGS} isn't plain JSON (comments or trailing commas?), so eb schemas leaves it as it is.`,
    );
    expect(run.err).toContain(JSON.stringify({ 'json.schemas': LUDUS_ENTRIES }, null, 2));
    expect(read(dir, SETTINGS)).toBe(mine);
    expect(existsSync(join(dir, SCHEMAS))).toBe(false);
  });

  it('leaves settings that are no JSON object as they are, and writes nothing', () => {
    const dir = ludus({ [SETTINGS]: '[]' });
    const run = eb(['schemas', dir]);
    expect(run).toMatchObject({ code: 2, out: '' });
    expect(run.err).toContain(`${SETTINGS} isn't a JSON object, so eb schemas leaves it as it is`);
    expect(read(dir, SETTINGS)).toBe('[]');
    expect(existsSync(join(dir, SCHEMAS))).toBe(false);
  });

  it('prints JSON for machines', () => {
    const run = eb(['schemas', ludus(), '--json']);
    expect(run.code).toBe(0);
    expect(JSON.parse(run.out)).toEqual({
      ok: true,
      written: ['gladiator', 'school', 'weapon'],
      typeFiles: true,
      removed: [],
      skipped: [],
      untyped: [],
      settingsChanged: true,
    });
  });

  describe('exit 2, touching nothing', () => {
    const zip = join(mkdtempSync(join(tmpdir(), 'eb-schemas-')), 'ludus.zip');
    writeFileSync(zip, 'not read');
    const empty = mkdtempSync(join(tmpdir(), 'eb-schemas-'));
    it.each([
      ['a zip', [zip], "isn't one: unzip it, then run eb schemas on the folder"],
      ['a folder with no project.json', [empty], 'has no project.json, so eb schemas leaves it as it is'],
      ['--out', [ludus(), '--out', 'x.json'], '--out only applies to eb build'],
      ['--game', [ludus(), '--game', 'game.ts'], '--game only applies to eb sim'],
    ])('for %s', (_name, args, message) => {
      const run = eb(['schemas', ...args]);
      expect(run).toMatchObject({ code: 2, out: '' });
      expect(run.err).toContain(message);
      expect(existsSync(join(String(args[0]), '.vscode'))).toBe(false);
    });
  });
});

/**
 * The language service VS Code's JSON support runs, set up as VS Code sets it up from the folder's
 * settings, a relative url being the folder's: what a person editing a record by hand would see.
 */
function vscode(dir: string) {
  const root = pathToFileURL(`${dir}/`);
  const service = getLanguageService({ schemaRequestService: async (uri) => readFileSync(fileURLToPath(uri), 'utf8') });
  const settings = JSON.parse(read(dir, SETTINGS)) as { 'json.schemas': { fileMatch: string[]; url: string }[] };
  const schemas = settings['json.schemas'].map(({ fileMatch, url }) => ({
    fileMatch,
    uri: new URL(url, root).toString(),
  }));
  service.configure({ validate: true, allowComments: false, schemas });
  const open = (path: string, text: string) => {
    const document = TextDocument.create(new URL(path, root).toString(), 'json', 1, text);
    return { document, json: service.parseJSONDocument(document) };
  };
  return {
    /** Each problem in the file, as the text it marks. */
    async problems(path: string, text = read(dir, path)) {
      const { document, json } = open(path, text);
      return (await service.doValidation(document, json)).map((problem) => document.getText(problem.range));
    },
    /** What is offered with the cursor at `at`. */
    async offers(path: string, text: string, at: number) {
      const { document, json } = open(path, text);
      return (await service.doComplete(document, document.positionAt(at), json))?.items.map((item) => item.label);
    },
  };
}

describe("the schemas in VS Code's JSON language service", () => {
  const dir = ludus();
  eb(['schemas', dir]);
  const code = vscode(dir);

  it('find no problems in the records eb validate passes', async () => {
    for (const type of readdirSync(join(dir, 'records'))) {
      for (const name of readdirSync(join(dir, 'records', type))) {
        expect(await code.problems(`records/${type}/${name}`)).toEqual([]);
      }
    }
  });

  it('mark the values and fields a form refuses', async () => {
    const bad = {
      name: '',
      might: 'strong',
      style: 'boxer',
      school: 'Ludus Magnus',
      free: false,
      skills: [],
      record: { wins: 1, losses: 0 },
      colour: '#a00000',
      portrait: 'spiculus.txt',
    };
    expect((await code.problems('records/gladiator/bad.json', JSON.stringify(bad))).sort()).toEqual(
      ['""', '"strong"', '"boxer"', '"Ludus Magnus"', '"colour"', '"spiculus.txt"'].sort(),
    );
  });

  it("offer a type's fields and a field's choices", async () => {
    expect(await code.offers('records/school/new.json', '{\n  \n}', 4)).toEqual(['name', 'colour', 'founded']);
    expect(await code.offers('records/gladiator/new.json', '{ "style": "" }', 12)).toEqual([
      '"retiarius"',
      '"murmillo"',
      '"secutor"',
      '"thraex"',
    ]);
  });

  it('find no problems in the type files eb validate passes, and mark what a type file must not hold', async () => {
    for (const name of readdirSync(join(dir, 'types'))) expect(await code.problems(`types/${name}`)).toEqual([]);
    const horse = { title: 'Horse', fields: { speed: { kind: 'int', min: 'slow' } }, colour: 'bay' };
    expect(await code.problems('types/horse.json', JSON.stringify(horse))).toEqual(['"slow"', '"colour"']);
  });

  it('offer every kind a field can be, those that need more than a kind included', async () => {
    const text = '{ "title": "Horse", "fields": { "speed": { "kind": "" } } }';
    const offered = await code.offers('types/horse.json', text, text.indexOf('""') + 1);
    expect(offered?.sort()).toEqual(FIELD_KINDS.map((kind) => `"${kind}"`).sort());
  });
});

describe("the engine's flag and sheet (M3.1, D36)", () => {
  const sheet = {
    name: 'The arena',
    rows: [
      {
        id: 'cheer',
        when: { event: 'flag/changed', args: { flag: 'raids' } },
        if: 'flag.on(met)',
        do: [{ effect: 'roll', outcomes: [{ chance: 100, effects: [{ effect: 'crowd', loud: true }] }] }],
        once: true,
      },
    ],
  };
  const dir = ludus({
    'records/flag/raids.json': JSON.stringify({ number: { max: 5 } }),
    'records/flag/met.json': '{}',
    'records/sheet/arena.json': JSON.stringify(sheet),
  });

  it('get schemas once the project has their records, and none before', async () => {
    expect(eb(['schemas', ludus()]).out).toBe(`${WROTE} and mapped them in ${SETTINGS}.\n`);
    expect(eb(['schemas', dir]).out).toBe(
      `Wrote the schemas of type files and of 5 record types (flag, gladiator, school, sheet, weapon) to ${SCHEMAS}/ and mapped them in ${SETTINGS}.\n`,
    );
    const code = vscode(dir);
    expect(await code.problems('records/sheet/arena.json')).toEqual([]);
    expect(await code.problems('records/flag/raids.json')).toEqual([]);
    // A row's misspelled field, and an effect that doesn't name itself: VS Code marks a missing
    // field at its object's opening brace.
    const bad = { rows: [{ ...sheet.rows[0], onse: true, do: [{ flag: 'met' }] }] };
    expect((await code.problems('records/sheet/bad.json', JSON.stringify(bad))).sort()).toEqual(['"onse"', '{'].sort());
  });
});
