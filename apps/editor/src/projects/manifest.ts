/** project.json as the editor meets it: read from a project's bytes, or written for a new one. */
import { checkManifest, idFromName, PROJECT_FORMAT, parseJsonFile } from '@eb/compiler';

export { idFromName };

export type ManifestProject = NonNullable<ReturnType<typeof checkManifest>['project']>;

/** The project's id, name and version, or what stops project.json being read, in a sentence. */
export function readManifest(bytes: Uint8Array): { project: ManifestProject | null; trouble: string | null } {
  const parsed = parseJsonFile(bytes);
  if (!parsed.ok) return { project: null, trouble: `project.json: ${parsed.message}.` };
  const { project, problems } = checkManifest(parsed.value);
  if (project) return { project, trouble: null };
  const said = problems.map((p) => (p.path === '' ? p.message : `${p.path.slice(1)}: ${p.message}`));
  return { project: null, trouble: `project.json: ${said.join('; ')}.` };
}

/** project.json's bytes for a new project, laid out as a person would write it. */
export function newManifest(name: string): { id: string; bytes: Uint8Array } {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('A project needs a name.');
  const manifest = { format: PROJECT_FORMAT, id: idFromName(trimmed), name: trimmed, version: '0.1.0' };
  return { id: manifest.id, bytes: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`) };
}
