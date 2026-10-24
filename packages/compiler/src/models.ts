/**
 * Each model record's file, read as far as its glTF JSON (M5.5, D67, docs/specs/models.md#the-checks):
 * E070 for one the engine can't draw, W146 for a material slot the file has no material of. A file
 * that isn't in assets/ is E018 already, from the record's asset field, and isn't read again here.
 * The editor runs the same check after its record index.
 */
import { type Diagnostic, type DiagnosticCode, isAssetOf, MODEL, type RecordInput, severityOf } from '@eb/schema';
import { type GltfSummary, gltfProblems, gltfSummary } from './gltf.ts';
import type { ProjectSource } from './source.ts';

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A model record's file, when its value names one that is there and is a model. */
export function modelFileOf(value: unknown, assets: ReadonlySet<string>): string | null {
  if (!isObject(value) || typeof value.file !== 'string') return null;
  return assets.has(value.file) && isAssetOf(value.file, 'model') ? value.file : null;
}

/** E070 and W146 for one model record, given its file's summary. */
export function modelDiagnostics(record: RecordInput, summary: GltfSummary | string): Diagnostic[] {
  const at = (code: DiagnosticCode, path: string, message: string): Diagnostic => ({
    code,
    severity: severityOf(code),
    message,
    type: record.type,
    id: record.id,
    ...(record.file !== undefined ? { file: record.file } : {}),
    path,
  });
  const found = gltfProblems(summary).map((problem) => at('E070', '/file', problem));
  if (typeof summary === 'string' || !isObject(record.value) || !Array.isArray(record.value.materials)) return found;
  record.value.materials.forEach((entry: unknown, i: number) => {
    if (!isObject(entry) || typeof entry.slot !== 'string' || summary.slots.includes(entry.slot)) return;
    const has = summary.slots.length === 0 ? 'none' : summary.slots.map((s) => `“${s}”`).join(', ');
    found.push(at('W146', `/materials/${i}/slot`, `The file has no material “${entry.slot}”: it has ${has}`));
  });
  return found;
}

/** E070 and W146 over the project's model records, each file read once. */
export async function checkModels(
  source: ProjectSource,
  records: readonly RecordInput[],
  assets: ReadonlySet<string>,
): Promise<Diagnostic[]> {
  const summaries = new Map<string, GltfSummary | string>();
  const diagnostics: Diagnostic[] = [];
  for (const record of records) {
    if (record.type !== MODEL || record.unreadable) continue;
    const file = modelFileOf(record.value, assets);
    if (file === null) continue;
    let summary = summaries.get(file);
    if (summary === undefined) {
      const bytes = await source.read(`assets/${file}`);
      summary = bytes ? gltfSummary(file, bytes, assets) : 'It can’t be read';
      summaries.set(file, summary);
    }
    diagnostics.push(...modelDiagnostics(record, summary));
  }
  return diagnostics;
}
