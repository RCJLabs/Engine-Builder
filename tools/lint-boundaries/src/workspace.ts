import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface WorkspacePackage {
  name: string;
  dir: string;
  pure: boolean;
}

/** Workspace packages from pnpm-workspace.yaml's `dir/*` globs (the only form this repo uses). */
export function workspacePackages(root: string): WorkspacePackage[] {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const globs = [...yaml.matchAll(/^\s*-\s*['"]?([\w./-]+)\/\*['"]?\s*$/gm)].map((m) => m[1] as string);
  const found: WorkspacePackage[] = [];
  for (const base of globs) {
    const parent = join(root, base);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const manifest = join(parent, entry.name, 'package.json');
      if (!entry.isDirectory() || !existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; eb?: { pure?: boolean } };
      if (pkg.name) found.push({ name: pkg.name, dir: join(parent, entry.name), pure: pkg.eb?.pure === true });
    }
  }
  return found;
}

/** Source files a rule should see: `.ts`/`.tsx` under `src`, tests excluded. */
export function sourceFiles(dir: string): string[] {
  const src = join(dir, 'src');
  if (!existsSync(src)) return [];
  return readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(src, f))
    .sort();
}

export const rel = (root: string, file: string): string => relative(root, file);
