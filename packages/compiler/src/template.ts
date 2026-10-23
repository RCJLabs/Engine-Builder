/**
 * A project from a template (M4.11, D61): every file of the template, with project.json and
 * export.json given the author's name. The editor's New project and `eb new` both make one this
 * way, so a project starts the same from either. The spec is docs/specs/templates.md.
 */
import { EXPORT_FILE } from './exportFile.ts';
import { MANIFEST_FILE } from './layout.ts';

/** A template as templates/templates.json lists it: what New project offers. */
export interface TemplateEntry {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
}

/** The longest short name launchers show whole (W138). */
const SHORT_NAME = 12;

/** "Salvage Run!" becomes salvage-run: lowercase letters and digits joined by hyphens, at most 64. */
export function idFromName(name: string): string {
  const id = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 64)
    .replace(/^-+|-+$/g, '');
  return id === '' ? 'project' : id;
}

/** The name, when it fits a launcher; else its first words that do; else its first 12 characters. */
export function shortNameOf(name: string): string {
  if (name.length <= SHORT_NAME) return name;
  let short = '';
  for (const word of name.split(/\s+/)) {
    const longer = short === '' ? word : `${short} ${word}`;
    if (longer.length > SHORT_NAME) break;
    short = longer;
  }
  return short === '' ? name.slice(0, SHORT_NAME).trim() : short;
}

const text = (value: unknown): Uint8Array => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

function jsonOf(bytes: Uint8Array, file: string): Record<string, unknown> {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${file} isn't a JSON object`);
  return value as Record<string, unknown>;
}

/**
 * The template's files as the author's project: project.json takes the name and the id made from
 * it, keeping the kits, calendar and version; export.json takes the name, and a short name from
 * it that fits (shortNameOf), so a new project never starts with W138. Nothing else changes, and
 * nothing in the project points back at the template.
 */
export function fromTemplate(files: ReadonlyMap<string, Uint8Array>, name: string): Map<string, Uint8Array> {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('A project needs a name.');
  const manifest = files.get(MANIFEST_FILE);
  if (manifest === undefined) throw new Error('The template has no project.json.');
  const made = new Map(files);
  made.set(MANIFEST_FILE, text({ ...jsonOf(manifest, MANIFEST_FILE), id: idFromName(trimmed), name: trimmed }));
  const exported = files.get(EXPORT_FILE);
  if (exported !== undefined) {
    const { name: _name, 'short-name': _short, ...rest } = jsonOf(exported, EXPORT_FILE);
    made.set(EXPORT_FILE, text({ name: trimmed, 'short-name': shortNameOf(trimmed), ...rest }));
  }
  return made;
}
