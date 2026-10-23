import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectFromTemplate, TEMPLATES, templateFiles } from './templates.ts';

const ROOT = resolve(import.meta.dirname, '../../../../templates');

/** Every file of a template on disk, as eb new reads them. */
function onDisk(id: string): Map<string, string> {
  const base = join(ROOT, id);
  const found = new Map<string, string>();
  for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    found.set(relative(base, path), readFileSync(path, 'utf8'));
  }
  return found;
}

describe('the templates bundled into the editor', () => {
  it('are the ones templates.json lists, each bundled', async () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['salvage-coast', 'last-ferry']);
    for (const { id } of TEMPLATES) expect((await templateFiles(id)).size).toBeGreaterThan(10);
  });

  it('hold every file of the template on disk, byte for byte, and nothing else', async () => {
    const decoder = new TextDecoder();
    for (const { id } of TEMPLATES) {
      const bundled = await templateFiles(id);
      const disk = onDisk(id);
      expect([...bundled.keys()].sort()).toEqual([...disk.keys()].sort());
      for (const [path, text] of disk) expect(decoder.decode(bundled.get(path)), `${id}/${path}`).toBe(text);
    }
  });

  it('make a project under the author’s name, as eb new does', async () => {
    const made = await projectFromTemplate('last-ferry', 'Nightboat');
    const manifest = JSON.parse(new TextDecoder().decode(made.get('project.json'))) as Record<string, unknown>;
    expect(manifest).toMatchObject({ id: 'nightboat', name: 'Nightboat', kits: ['dialogue', 'quests'] });
    expect(made.has('guide.json')).toBe(true);
    await expect(templateFiles('tower-defence')).rejects.toThrow('There is no template "tower-defence".');
  });
});
