/**
 * eb schemas (M2.8, D35): each record type's JSON Schema into .vscode/eb-schemas/<type>.json,
 * mapped to records/<type>/*.json in .vscode/settings.json, so a record edited by hand in VS Code
 * gets the same checks and autocomplete as a form. Record files stay pure data: a `$schema` key
 * in one would be refused, records being strict. Hidden, so the compiler and zips leave them out.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readProjectFiles } from '@eb/compiler';
import { type RecordType, recordJsonSchema } from '@eb/schema';
import { folderSource } from './folderSource.ts';
import { loadTypes, UsageError } from './modules.ts';

export const SCHEMA_DIR = '.vscode/eb-schemas';
export const SETTINGS_FILE = '.vscode/settings.json';
const URL_PREFIX = `./${SCHEMA_DIR}/`;

export interface SchemasResult {
  /** Types whose schema was written, in name order. */
  readonly written: readonly string[];
  /** Schema files of types the project no longer has. */
  readonly removed: readonly string[];
  /** Types whose files have problems: no schema until they are fixed. */
  readonly skipped: readonly { readonly type: string; readonly why: string }[];
  /** Types the project's records are of that neither types/ nor the --types module defines. */
  readonly untyped: readonly string[];
  readonly settingsChanged: boolean;
}

interface SchemaEntry {
  readonly fileMatch: readonly string[];
  readonly url: string;
}

/** The settings' entry for a type: its records, wherever the folder is opened, to its schema. */
const entryOf = (type: string): SchemaEntry => ({
  fileMatch: [`**/records/${type}/*.json`],
  url: `${URL_PREFIX}${type}.json`,
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The indentation a JSON file was written with, so a rewrite keeps it: two spaces when it shows none. */
function indentOf(text: string): string | number {
  const found = /^[ \t]+(?=")/m.exec(text)?.[0];
  return found ?? 2;
}

/**
 * The settings with this command's entries in `json.schemas`, those of other tools kept and in
 * front. Throws when the file isn't plain JSON: VS Code allows comments there, which a rewrite
 * would lose, so the person adds the entries by hand.
 */
function mergedSettings(text: string | undefined, entries: readonly SchemaEntry[]): string {
  let settings: Record<string, unknown> = {};
  if (text !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const snippet = JSON.stringify({ 'json.schemas': entries }, null, 2);
      throw new UsageError(
        `${SETTINGS_FILE} isn't plain JSON (comments or trailing commas?), so eb schemas leaves it as it is. Add this to it by hand:\n${snippet}`,
      );
    }
    if (!isObject(parsed))
      throw new UsageError(`${SETTINGS_FILE} isn't a JSON object, so eb schemas leaves it as it is`);
    settings = parsed;
  }
  const before = Array.isArray(settings['json.schemas']) ? settings['json.schemas'] : [];
  const others = before.filter(
    (entry) => !(isObject(entry) && typeof entry.url === 'string' && entry.url.startsWith(URL_PREFIX)),
  );
  // Nothing of eb's there and nothing to add: the file stays as its owner wrote it.
  if (text !== undefined && entries.length === 0 && others.length === before.length) return text;
  const next = { ...settings, 'json.schemas': [...others, ...entries] };
  return `${JSON.stringify(next, null, text === undefined ? 2 : indentOf(text))}\n`;
}

const readText = (path: string) => readFile(path, 'utf8').catch(() => undefined);

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** What the project's types are, as eb schemas sees them: sound, broken, or missing for some records. */
async function readProjectTypes(folder: string, codeTypes: readonly RecordType[]) {
  const read = await readProjectFiles(folderSource(folder), codeTypes);
  const { types, unchecked } = read.types;
  const sound = types.filter((type) => !unchecked.has(type.type)).sort((a, b) => byName(a.type, b.type));
  const skipped = [...unchecked].sort(byName).map((type) => {
    const first = read.diagnostics.find((d) => d.file === `types/${type}.json`);
    return { type, why: first ? `${first.code} ${first.message}` : 'its type file has problems' };
  });
  const known = new Set(types.map((type) => type.type));
  const untyped = [...new Set(read.recordFiles.map((record) => record.type))].filter((type) => !known.has(type));
  return { sound, skipped, untyped: untyped.sort(byName) };
}

/** Writes the schemas and the settings that map them. Throws a UsageError before writing anything when the settings can't be kept. */
export async function writeSchemas(folder: string, codeTypes: readonly RecordType[]): Promise<SchemasResult> {
  // A folder with no project.json is most likely not a project at all: leave it untouched.
  if ((await readText(join(folder, 'project.json'))) === undefined) {
    throw new UsageError(`${folder} has no project.json, so eb schemas leaves it as it is`);
  }
  const { sound, skipped, untyped } = await readProjectTypes(folder, codeTypes);
  const settingsPath = join(folder, SETTINGS_FILE);
  const oldSettings = await readText(settingsPath);
  // With nothing to map and no settings yet, there are no settings to write.
  const settings =
    oldSettings === undefined && sound.length === 0
      ? undefined
      : mergedSettings(
          oldSettings,
          sound.map((t) => entryOf(t.type)),
        );
  const dir = join(folder, SCHEMA_DIR);
  if (sound.length > 0) await mkdir(dir, { recursive: true });
  for (const type of sound) {
    await writeFile(join(dir, `${type.type}.json`), `${JSON.stringify(recordJsonSchema(type), null, 2)}\n`);
  }
  const keep = new Set(sound.map((type) => `${type.type}.json`));
  const removed: string[] = [];
  const present = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const { name } of present.filter((entry) => entry.isFile()).sort((a, b) => byName(a.name, b.name))) {
    if (!name.endsWith('.json') || keep.has(name)) continue;
    await rm(join(dir, name));
    removed.push(name.slice(0, -'.json'.length));
  }
  const settingsChanged = settings !== undefined && settings !== oldSettings;
  if (settingsChanged) await writeFile(settingsPath, settings);
  return { written: sound.map((type) => type.type), removed, skipped, untyped, settingsChanged };
}

/** eb schemas: a folder only, as a zip has nowhere to write the schemas. */
export async function runSchemas(path: string, options: { types?: string; json?: boolean }): Promise<number> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isDirectory()) {
    const why = info?.isFile() ? ': unzip it, then run eb schemas on the folder' : '';
    throw new UsageError(`eb schemas writes into a project folder, and ${path} isn't one${why}`);
  }
  const { types } = options.types === undefined ? { types: [] } : await loadTypes(options.types);
  const result = await writeSchemas(path, types);
  if (options.json) console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  else for (const line of schemasReport(result)) console.log(line);
  return 0;
}

/** What eb schemas says it did. */
export function schemasReport(result: SchemasResult): string[] {
  const { written, settingsChanged } = result;
  const lines = [
    written.length === 0
      ? `No record types, so no schemas${settingsChanged ? `; took eb's entries out of ${SETTINGS_FILE}` : ''}.`
      : `Wrote ${written.length === 1 ? '1 schema' : `${written.length} schemas`} to ${SCHEMA_DIR}/ (${written.join(', ')})${
          settingsChanged ? ` and mapped them in ${SETTINGS_FILE}` : `; ${SETTINGS_FILE} already maps them`
        }.`,
  ];
  for (const type of result.removed)
    lines.push(`Removed ${SCHEMA_DIR}/${type}.json: the project has no type ${type} now.`);
  for (const { type, why } of result.skipped) {
    lines.push(`No schema for ${type}: types/${type}.json has problems (${why}). Fix it, then run eb schemas again.`);
  }
  if (result.untyped.length > 0) {
    lines.push(
      `No schema for the records of ${result.untyped.join(', ')}: no type defines them. Pass --types <module>, or add types/<type>.json.`,
    );
  }
  return lines;
}
