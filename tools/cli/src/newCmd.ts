/**
 * eb new: a project folder from a template (M4.11, D61), the same files New project writes in
 * the editor, through the compiler's fromTemplate. The templates are templates/ in this repo,
 * listed by templates/templates.json (docs/specs/templates.md).
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fromTemplate, type TemplateEntry } from '@eb/compiler';
import { UsageError } from './modules.ts';

export const TEMPLATES = resolve(import.meta.dirname, '../../../templates');

async function filesUnder(root: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(relative(root, path).split('\\').join('/'), new Uint8Array(await readFile(path)));
  }
  return files;
}

async function listed(): Promise<TemplateEntry[]> {
  return JSON.parse(await readFile(join(TEMPLATES, 'templates.json'), 'utf8')) as TemplateEntry[];
}

const listing = (all: readonly TemplateEntry[]) =>
  ['The templates are:', ...all.map((t) => `  ${t.id}: ${t.title}. ${t.blurb}`)].join('\n');

/** Writes the template into `folder`, which must not exist or be empty; the name is the folder's unless given. */
export async function runNew(folder: string, flags: { template?: string; name?: string }): Promise<number> {
  const all = await listed();
  const template = all.find((t) => t.id === flags.template);
  if (!template) {
    const said = flags.template === undefined ? 'eb new needs --template <id>.' : `No template "${flags.template}".`;
    throw new UsageError(`${said}\n${listing(all)}`);
  }
  const there = await readdir(folder).catch(() => []);
  if (there.length > 0) throw new UsageError(`${folder} isn't empty: eb new writes a project into a new folder`);
  const name = flags.name ?? basename(resolve(folder));
  const made = fromTemplate(await filesUnder(join(TEMPLATES, template.id)), name);
  for (const [path, bytes] of made) {
    const to = join(folder, path);
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, bytes);
  }
  console.log(`Made ${folder} from the ${template.id} template: ${made.size} files, named "${name.trim()}".`);
  return 0;
}
