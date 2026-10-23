/**
 * guide.json (M4.11, D61): steps for making a project one's own, which a template carries and the
 * Project panel shows under "Make it yours". Each step opens a file where a problem in it would
 * open, or a panel. Its shape is E057; a step opening what the project lacks, or a file the editor
 * has no place for, is W140. Nothing in a game reads it, so packs never carry it. The spec is
 * docs/specs/templates.md#guidejson.
 */
import { RECORD_ID_PATTERN } from '@eb/core';
import { type Diagnostic, type DiagnosticCode, schemaIssues, severityOf, z } from '@eb/schema';
import { classifyScript, SCRIPTS_DIR } from '@eb/script';
import { EXPORT_FILE } from './exportFile.ts';
import { ASSETS_DIR, classifyRecordFile, classifyTypeFile, MANIFEST_FILE, RECORDS_DIR, TYPES_DIR } from './layout.ts';
import { classifyScene, SCENES_DIR } from './sceneFiles.ts';
import { classifyUi, UI_DIR } from './uiFiles.ts';

export const GUIDE_FILE = 'guide.json';

/** "Make it yours", when the file names no title of its own. */
export const GUIDE_TITLE = 'Make it yours';

/** The panels a step may show. */
export const GUIDE_PANELS = ['project', 'records', 'assets', 'world', 'logic', 'play', 'problems'] as const;
export type GuidePanel = (typeof GUIDE_PANELS)[number];

const POINTER = /^(?:\/(?:[^~/]|~[01])*)*$/;

const open = z.union(
  [
    z.strictObject({
      file: z.string().min(1),
      at: z.string().regex(POINTER, { error: 'Expected a JSON Pointer like "/stages/0"' }).optional(),
    }),
    z.strictObject({ panel: z.enum(GUIDE_PANELS) }),
  ],
  { error: `Expected { "file": … } or { "panel": … }, a panel being one of ${GUIDE_PANELS.join(', ')}` },
);

export const guideSchema = z.strictObject({
  title: z.string().min(1).max(60).optional(),
  steps: z
    .array(
      z.strictObject({
        id: z.string().regex(RECORD_ID_PATTERN, { error: 'Not an id: use lowercase words joined by hyphens' }),
        title: z.string().min(1).max(80),
        text: z.string().min(1).max(400),
        open,
      }),
    )
    .min(1)
    .max(20),
});

export type GuideJson = z.infer<typeof guideSchema>;
export type GuideStep = GuideJson['steps'][number];

const at = (code: DiagnosticCode, path: string, message: string): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  file: GUIDE_FILE,
  path,
});

/** Whether the editor has a place for `file`, as Problems opens it: what a step may open. */
export function opensInEditor(file: string): boolean {
  if (file === MANIFEST_FILE || file === EXPORT_FILE) return true;
  const top = file.split('/')[0];
  if (top === RECORDS_DIR) return classifyRecordFile(file).kind === 'record';
  if (top === TYPES_DIR) return classifyTypeFile(file).kind === 'type';
  if (top === SCRIPTS_DIR) return classifyScript(file).kind === 'script';
  if (top === SCENES_DIR) return classifyScene(file).kind === 'scene';
  if (top === UI_DIR) return classifyUi(file).kind !== 'ignored';
  return top === ASSETS_DIR && file.length > ASSETS_DIR.length + 1;
}

export interface GuideChecked {
  /** guide.json as read, when its shape is sound. */
  readonly guide: GuideJson | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

/** guide.json's value checked against the files the project has (`has`); undefined when there is none. */
export function checkGuide(value: unknown, has: (file: string) => boolean): GuideChecked {
  if (value === undefined) return { guide: undefined, diagnostics: [] };
  const issues = schemaIssues(guideSchema, value);
  if (issues.length > 0) {
    return { guide: undefined, diagnostics: issues.map((issue) => at('E057', issue.path, issue.message)) };
  }
  const guide = value as GuideJson;
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  guide.steps.forEach((step, i) => {
    if (seen.has(step.id)) diagnostics.push(at('E057', `/steps/${i}/id`, `Another step is already "${step.id}"`));
    seen.add(step.id);
    if (!('file' in step.open)) return;
    const { file } = step.open;
    if (!opensInEditor(file)) {
      diagnostics.push(at('W140', `/steps/${i}/open/file`, `The editor has no place to open "${file}"`));
    } else if (!has(file)) {
      diagnostics.push(at('W140', `/steps/${i}/open/file`, `The project has no file "${file}"`));
    }
  });
  return { guide, diagnostics };
}
