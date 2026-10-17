/** What the Project panel says about an open project: who it is, what it holds, and what is wrong. */
import { classifyRecordFile, MANIFEST_FILE, type ProjectSource, projectFiles, RECORDS_DIR } from '@eb/compiler';
import { type ManifestProject, readManifest } from './manifest.ts';

export interface ProjectSummary {
  /** Null when project.json is missing or can't be read; `problems` says why. */
  readonly project: ManifestProject | null;
  /** The project's own files (projectFiles). */
  readonly files: number;
  /** Records by type, types in name order. */
  readonly types: readonly { readonly type: string; readonly records: number }[];
  readonly problems: readonly string[];
}

export async function summarize(source: ProjectSource): Promise<ProjectSummary> {
  const paths = await projectFiles(source);
  const problems: string[] = [];
  let project: ManifestProject | null = null;
  const manifest = await source.read(MANIFEST_FILE);
  if (manifest === undefined) problems.push('There is no project.json.');
  else {
    const read = readManifest(manifest);
    project = read.project;
    if (read.trouble) problems.push(read.trouble);
  }
  const counts = new Map<string, number>();
  for (const path of paths) {
    if (!path.startsWith(`${RECORDS_DIR}/`)) continue;
    const file = classifyRecordFile(path);
    if (file.kind === 'record') counts.set(file.type, (counts.get(file.type) ?? 0) + 1);
    if (file.kind === 'misplaced') problems.push(`${path} looks like a record but sits outside a type folder.`);
  }
  const types = [...counts]
    .map(([type, records]) => ({ type, records }))
    .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
  return { project, files: paths.length, types, problems };
}

/** "12 records in 3 types", or "No records yet". */
export function recordsLine(summary: ProjectSummary): string {
  const records = summary.types.reduce((sum, t) => sum + t.records, 0);
  if (records === 0) return 'No records yet';
  const types = summary.types.length;
  return `${records} ${records === 1 ? 'record' : 'records'} in ${types} ${types === 1 ? 'type' : 'types'}`;
}
