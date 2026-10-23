/**
 * guide.json's problems in the editor (M4.11, D61): checked as compileProject checks it
 * (checkGuide), against the files the project has, so Problems lists what `eb validate` does.
 */
import { checkGuide, GUIDE_FILE, type ProjectSource, parseJsonFile, projectFiles } from '@eb/compiler';
import type { Diagnostic } from '@eb/schema';

export async function guideProblems(source: ProjectSource): Promise<Diagnostic[]> {
  const bytes = await source.read(GUIDE_FILE);
  if (bytes === undefined) return [];
  const parsed = parseJsonFile(bytes);
  if (!parsed.ok) return [{ code: 'E007', severity: 'error', message: parsed.message, file: GUIDE_FILE, path: '' }];
  const present = new Set(await projectFiles(source));
  return [...checkGuide(parsed.value, (file) => present.has(file)).diagnostics];
}
