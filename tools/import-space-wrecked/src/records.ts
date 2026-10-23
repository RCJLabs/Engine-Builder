/**
 * The records an import makes, by type and id, and how they are written: one file each at
 * records/<type>/<id>.json, as JSON.stringify writes it with two spaces and a newline. The
 * import owns that layout, so a test can hold the committed files to it byte for byte.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Value = Readonly<Record<string, unknown>>;

export class RecordSet {
  readonly #types = new Map<string, Map<string, Value>>();

  /** Adds a record. Two of the same type and id are a bug in the import. */
  add(type: string, id: string, value: Value): void {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Bad id ${type}:${id}`);
    const ids = this.#types.get(type) ?? new Map<string, Value>();
    if (ids.has(id)) throw new Error(`Two records ${type}:${id}`);
    ids.set(id, value);
    this.#types.set(type, ids);
  }

  has(type: string, id: string): boolean {
    return this.#types.get(type)?.has(id) ?? false;
  }

  /** Every file, as its path under records/ and its text, sorted by path. */
  files(): { path: string; text: string }[] {
    const out: { path: string; text: string }[] = [];
    for (const [type, ids] of this.#types) {
      for (const [id, value] of ids)
        out.push({ path: `${type}/${id}.json`, text: `${JSON.stringify(value, null, 2)}\n` });
    }
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
}

/** Writes the set into `folder` (records/), first removing everything there, so nothing stale stays. */
export function writeRecords(set: RecordSet, folder: string): number {
  rmSync(folder, { recursive: true, force: true });
  const files = set.files();
  for (const { path, text } of files) {
    const at = join(folder, path);
    mkdirSync(join(at, '..'), { recursive: true });
    writeFileSync(at, text);
  }
  return files.length;
}

/** Every file under `folder`, as `writeRecords` lays them out, for the test to compare. */
export function readRecords(folder: string, read: (path: string) => string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const type of readdirSync(folder).sort()) {
    for (const file of readdirSync(join(folder, type)).sort()) {
      out.push({ path: `${type}/${file}`, text: read(join(folder, type, file)) });
    }
  }
  return out;
}

/** An id from words: "Union Hall Twelve" is union-hall-twelve, "Ruth's Canteen" ruths-canteen. */
export const idOf = (words: string): string =>
  words
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Leaves out the keys whose value is undefined, so a record holds only what it says. */
export function defined(value: Record<string, unknown>): Value {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
