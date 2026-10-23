/**
 * export.json checked against the project (M4.10, D60): its shape and what it names (E056), the
 * records each edition keeps that name what it leaves out (E055), a long short name (W138) and an
 * Android app with no fingerprints to vouch for it (W139). compileProject runs it, and the
 * editor's Problems panel runs it over the record index, so both give the same list.
 */
import { parseRef } from '@eb/core';
import { type Diagnostic, type DiagnosticCode, schemaIssues, severityOf, type Usage } from '@eb/schema';
import { EXPORT_FILE, type ExportJson, exportSchema, FULL, type LeaveOut, leaveOutOf } from './exportFile.ts';

/** What the check reads of the project. */
export interface ExportContext {
  /** Every record type there is: the engine's, the kits' and the project's own. */
  readonly types: ReadonlySet<string>;
  /** Every record, as "type:id"; a scene is its talk's. */
  readonly records: ReadonlySet<string>;
  /** The ink scenes under scenes/, by id. */
  readonly scenes: ReadonlySet<string>;
  /** The files under assets/, as paths inside it. */
  readonly assets: ReadonlySet<string>;
  /** The record index's used-by: what names each "type:id", and each asset path. */
  readonly usedBy: ReadonlyMap<string, readonly Usage[]>;
  readonly assetsUsedBy: ReadonlyMap<string, readonly Usage[]>;
}

export interface ExportChecked {
  /** export.json as read, when its shape is sound, even if what it names isn't. */
  readonly settings: ExportJson | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

const at = (code: DiagnosticCode, path: string, message: string): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  file: EXPORT_FILE,
  path,
});

/** export.json's value checked; undefined when the project has none. */
export function checkExport(value: unknown, ctx: ExportContext): ExportChecked {
  if (value === undefined) return { settings: undefined, diagnostics: [] };
  const issues = schemaIssues(exportSchema, value);
  if (issues.length > 0) {
    return { settings: undefined, diagnostics: issues.map((issue) => at('E056', issue.path, issue.message)) };
  }
  const settings = value as ExportJson;
  const diagnostics = [...checkNames(settings, ctx), ...checkTargets(settings, ctx)];
  for (const edition of Object.keys(settings.editions ?? {})) {
    if (edition !== FULL) diagnostics.push(...keptNamingLeftOut(edition, leaveOutOf(settings, edition), ctx));
  }
  return { settings, diagnostics };
}

/** Each edition's id and its leave-out lists, against what the project has. */
function checkNames(settings: ExportJson, ctx: ExportContext): Diagnostic[] {
  const found: Diagnostic[] = [];
  for (const [edition, { 'leave-out': out }] of Object.entries(settings.editions ?? {})) {
    const base = `/editions/${edition.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    if (edition === FULL) {
      found.push(at('E056', base, '"full" is the game with nothing left out: name this edition something else'));
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(edition)) {
      found.push(at('E056', base, `"${edition}" isn’t an id: name an edition in lowercase words joined by hyphens`));
    }
    const lists: readonly [keyof LeaveOut, (name: string) => string | undefined][] = [
      ['types', (type) => (ctx.types.has(type) ? undefined : `No record type "${type}"`)],
      ['records', (key) => recordProblem(key, ctx)],
      ['scenes', (scene) => (ctx.scenes.has(scene) ? undefined : `No scene "${scene}" under scenes/`)],
      ['assets', (path) => (ctx.assets.has(path) ? undefined : `No asset "${path}" under assets/`)],
    ];
    for (const [list, problem] of lists) {
      (out?.[list] ?? []).forEach((name, index) => {
        const message =
          list === 'assets' && name === settings.icon
            ? 'The icon is in every edition: it can’t be left out'
            : problem(name);
        if (message) found.push(at('E056', `${base}/leave-out/${list}/${index}`, message));
      });
    }
  }
  return found;
}

function recordProblem(key: string, ctx: ExportContext): string | undefined {
  if (!parseRef(key)) return `"${key}" isn’t a record: write it as "type:id"`;
  return ctx.records.has(key) ? undefined : `No record ${key}`;
}

/** The targets: editions that exist, an icon that is a PNG asset, and what Android needs. */
function checkTargets(settings: ExportJson, ctx: ExportContext): Diagnostic[] {
  const found: Diagnostic[] = [];
  const editions = new Set([FULL, ...Object.keys(settings.editions ?? {})]);
  const targets = settings.targets ?? {};
  for (const target of ['web', 'file', 'itch'] as const) {
    const edition = targets[target]?.edition;
    if (edition !== undefined && !editions.has(edition)) {
      found.push(at('E056', `/targets/${target}/edition`, `No edition "${edition}" in export.json`));
    }
  }
  const icon = settings.icon;
  if (icon !== undefined && !(icon.toLowerCase().endsWith('.png') && ctx.assets.has(icon))) {
    found.push(at('E056', '/icon', `The icon must be a PNG under assets/: no "${icon}" there`));
  }
  if (targets.android) {
    if (targets.web?.domain === undefined) {
      const message =
        'An Android app needs the web build on its own domain, whose root serves .well-known/assetlinks.json: set the web target’s domain';
      found.push(at('E056', '/targets/android', message));
    }
    if ((targets.android.fingerprints ?? []).length === 0) {
      const message =
        'No fingerprints: until assetlinks.json names the key the app is signed with, it opens with a browser bar. Play Console shows the app signing key’s SHA-256 under Test and release, App signing';
      found.push(at('W139', '/targets/android/fingerprints', message));
    }
  }
  const short = settings['short-name'] ?? settings.name;
  if (short !== undefined && [...short].length > 12) {
    const path = settings['short-name'] === undefined ? '/name' : '/short-name';
    found.push(
      at('W138', path, `"${short}" is ${[...short].length} characters; launchers show about 12 under an icon`),
    );
  }
  return found;
}

/** Whether an edition leaves this record out: by its key, its type, or as a scene's talk. */
export function leavesOutRecord(out: LeaveOut, key: string): boolean {
  const ref = parseRef(key);
  if (!ref) return false;
  return (
    out.records.includes(key) || out.types.includes(ref.type) || (ref.type === 'talk' && out.scenes.includes(ref.id))
  );
}

/** E055: each place a record the edition keeps names something it leaves out. */
function keptNamingLeftOut(edition: string, out: LeaveOut, ctx: ExportContext): Diagnostic[] {
  const found: Diagnostic[] = [];
  const report = (usage: Usage, what: string) => {
    const from = parseRef(usage.from);
    if (!from || leavesOutRecord(out, usage.from)) return;
    found.push({
      code: 'E055',
      severity: 'error',
      message: `Names ${what}, which the ${edition} edition leaves out`,
      type: from.type,
      id: from.id,
      ...(usage.file === undefined ? {} : { file: usage.file }),
      path: usage.path,
    });
  };
  for (const [key, usages] of ctx.usedBy) {
    if (leavesOutRecord(out, key)) for (const usage of usages) report(usage, key);
  }
  for (const [path, usages] of ctx.assetsUsedBy) {
    if (out.assets.includes(path)) for (const usage of usages) report(usage, `the asset ${path}`);
  }
  return found;
}
