/**
 * The gate's e2e, its end: the hut exported as a zip, which must hold the fixture's files and no
 * others, each the same; then `eb validate` finds nothing, `eb sim` plays it to the fixture's
 * golden runs, and its bot finishes every quest in some of 100 runs.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { fixture, fixtureText, HUT } from './hutHelpers.ts';
import { openProject, REPO, scratch, showProject } from './ludus.ts';

const GOLDEN = join(REPO, 'tools/cli/test/fixtures/hut-keeper.golden.json');
const eb = (...args: string[]) =>
  execFileSync('node', ['tools/cli/src/cli.ts', ...args], { cwd: REPO, encoding: 'utf8' });

export async function exportHut(page: Page): Promise<string> {
  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const zip = join(scratch, `the-hut-${Date.now()}.zip`);
  await download.saveAs(zip);
  return zip;
}

/** A zip's files' bytes, by their paths under its one folder, read by Python: the music's file is not text (M4.8). */
function zipped(zip: string): Record<string, Buffer> {
  const script = [
    'import base64, json, sys, zipfile',
    'z = zipfile.ZipFile(sys.argv[1])',
    'names = [n for n in z.namelist() if not n.endswith("/")]',
    'print(json.dumps({n.split("/", 1)[1]: base64.b64encode(z.read(n)).decode("ascii") for n in names}))',
  ].join('\n');
  const files = JSON.parse(execFileSync('python3', ['-I', '-c', script, zip], { encoding: 'utf8' })) as Record<
    string,
    string
  >;
  return Object.fromEntries(Object.entries(files).map(([path, b64]) => [path, Buffer.from(b64, 'base64')]));
}

const fixtureFiles = (): string[] =>
  readdirSync(HUT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(HUT, join(entry.parentPath, entry.name)).split('\\').join('/'))
    .sort();

/**
 * The export holds the fixture's files and no others: records as the same JSON, scripts and scenes
 * as the same text, the music's file as the same bytes.
 */
export function expectTheFixture(zip: string): void {
  const files = zipped(zip);
  expect(Object.keys(files).sort()).toEqual(fixtureFiles());
  for (const [path, bytes] of Object.entries(files)) {
    if (path.endsWith('.json')) expect(JSON.parse(bytes.toString('utf8')), path).toEqual(fixture(path));
    else if (path.endsWith('.wav')) expect(bytes.equals(readFileSync(join(HUT, path))), path).toBe(true);
    else expect(bytes.toString('utf8'), path).toBe(fixtureText(path));
  }
}

/** eb finds it clean, plays it to the fixture's golden runs, and its bot finishes every quest in some run. */
export function expectPlayed(zip: string): void {
  expect(eb('validate', zip)).toMatch(/^25 records: no problems, hash [0-9a-f]{16}\.\n$/);
  expect(eb('sim', zip, '--golden', GOLDEN).trim().split('\n').at(-1)).toBe(`All 100 runs match ${GOLDEN}.`);
  const report = eb('sim', zip, '--policy', 'keeper', '--seeds', '100');
  expect(report).toContain('Refused offers: none.');
  for (const quest of ['supplies', 'guiding', 'loads']) {
    const done = new RegExp(`\\(${quest}\\): done (\\d+(?:\\.\\d+)?)%`).exec(report)?.[1];
    expect(Number(done), `${quest} in\n${report}`).toBeGreaterThan(0);
  }
}
