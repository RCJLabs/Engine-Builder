/**
 * M3.2 on desktop: a game started in the Logic panel, its scripts edited in the inspector's
 * CodeMirror, content made against the game's own event and effect, Run's report, and the
 * exported project played by `eb sim` to the same lines (the gate). Then trust for an imported
 * project, and a script's problems at their lines.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { firstModuleTemplate, gameTemplate } from '../src/scripts/templates.ts';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { importLudus, openProject, REPO, scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const HOLD = join(REPO, 'tools/cli/test/fixtures/hold');

/** The hold fixture (M3.2's game written as scripts) as a zip made by Python, with `extra` files. */
function holdZip(extra: Record<string, string> = {}): string {
  const path = join(scratch, `hold-${Object.keys(extra).length}-${Date.now()}.zip`);
  const script = [
    'import json, os, sys, zipfile',
    'src, out, extra = sys.argv[1], sys.argv[2], json.load(sys.stdin)',
    'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:',
    '    for base, dirs, files in os.walk(src):',
    '        for f in sorted(files):',
    '            full = os.path.join(base, f)',
    '            rel = os.path.relpath(full, src).replace(os.sep, "/")',
    '            if rel not in extra: z.write(full, "hold/" + rel)',
    '    for rel, text in extra.items(): z.writestr("hold/" + rel, text)',
  ].join('\n');
  execFileSync('python3', ['-I', '-c', script, HOLD, path], { input: JSON.stringify(extra) });
  return path;
}

async function importHold(page: Page, extra: Record<string, string> = {}): Promise<void> {
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(holdZip(extra));
  await expect(openProject(page).getByRole('heading', { name: 'Hold' })).toBeVisible();
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(openProject(page).getByRole('heading', { name })).toBeVisible();
}

const libraryRow = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem').filter({ hasText: name });

async function showLogic(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: 'Logic' }).click();
  const panel = page.locator('[data-panel="logic"]');
  await expect(panel.getByRole('heading', { name: 'Scripts' })).toBeVisible();
  return panel;
}

/** A script in the inspector, and its CodeMirror text. */
const scriptRegion = (page: Page, id: string) => page.getByRole('region', { name: `Script ${id}.ts` });
const code = (region: Locator) => region.locator('.cm-content');

/** Replaces a script's whole text as typed, in one go: what pasting does. */
async function replaceText(page: Page, region: Locator, text: string): Promise<void> {
  await code(region).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

/** A stored project's file as text, read from OPFS, or null while it can't be read. */
function storedText(page: Page, folder: string, path: string): Promise<string | null> {
  return page.evaluate(
    async ({ folder, path }) => {
      try {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
        dir = await dir.getDirectoryHandle(folder);
        const parts = path.split('/');
        const name = parts.pop() as string;
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        return await (await (await dir.getFileHandle(name)).getFile()).text();
      } catch {
        return null;
      }
    },
    { folder, path },
  );
}

/** The first module as Start a game writes it, with an effect content can name: five coins more. */
const MAIN = firstModuleTemplate('main').replace(
  '  effects: {\n',
  '  effects: {\n    bonus(ctx) {\n      ctx.write().coins = ctx.read().coins + 5;\n    },\n',
);

const meanCoins = (report: string) => Number(/^main\.coins: mean ([\d.]+)/m.exec(report)?.[1]);

async function runGames(panel: Locator): Promise<string> {
  await panel.getByRole('button', { name: 'Run 20 games' }).click();
  const report = panel.locator('.logic-report');
  await expect(report).toContainText('20 runs with the worker policy');
  return (await report.textContent()) ?? '';
}

test('a game started, scripted and run in the editor, exported and played by eb sim to the same report', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await createProject(page, 'Payday');
  const panel = await showLogic(page);
  await expect(panel.getByText(/^No scripts yet\./)).toBeVisible();
  await panel.getByRole('button', { name: 'Start a game' }).click();
  const game = scriptRegion(page, 'game');
  await expect(code(game)).toContainText('export const modules = [main];');
  await expect(panel.getByText('The game: main, starting in play; 2 actions; bots worker.')).toBeVisible();
  await expect(panel.getByRole('button', { name: /^game\.ts The game · No problems/ })).toBeVisible();
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  // The first module given an effect, typed in its editor: saved as typed.
  await panel.getByRole('button', { name: /^main\.ts/ }).click();
  const main = scriptRegion(page, 'main');
  await expect(code(main)).toContainText("id: 'main'");
  await replaceText(page, main, MAIN);
  await expect.poll(() => storedText(page, 'payday', 'scripts/main.ts')).toBe(MAIN);
  const before = await runGames(panel);

  // A sheet on the game's own event, doing its own effect: offered by the pickers once the game has run.
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Payday');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet payday' });
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const row = sheet.getByRole('group', { name: 'Row 1: row-1' });
  const when = row.getByRole('group', { name: 'When' });
  await when.getByLabel('Event', { exact: true }).selectOption({ label: 'A day ends' });
  await when.getByLabel(/^Day/).fill('5');
  // A condition on the game's own fact, read with its label. Rows run once the action is done, when
  // the day has moved on to 6, so every game gets the bonus; `main.day >= 1` would be W103, never
  // false within the fact's values.
  await row.getByLabel(/^If/).fill('main.day >= 5');
  await expect(row.getByText('Reads: the day is at least 5.')).toBeVisible();
  const does = row.getByRole('group', { name: 'Do' });
  await does.getByLabel('Effect to add to Do').selectOption({ label: 'bonus (this game’s)' });
  await does.getByRole('button', { name: 'Add effect to Do' }).click();
  await expect
    .poll(async () => JSON.parse((await storedText(page, 'payday', 'records/sheet/payday.json')) ?? 'null'))
    .toEqual({
      name: 'Payday',
      rows: [
        {
          id: 'row-1',
          when: { event: 'main/day-ended', args: { day: 5 } },
          if: 'main.day >= 5',
          do: [{ effect: 'bonus' }],
        },
      ],
    });
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^1\. row-1/ })).toContainText(
    'When a day ends (day: 5)If the day is at least 5Do: bonus',
  );

  // Every game reaches day 5, and the bonus draws nothing: each ends five coins richer.
  const after = await runGames(panel);
  expect(meanCoins(after)).toBe(meanCoins(before) + 5);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'payday.zip');
  await download.saveAs(exported);
  const cli = (...args: string[]) =>
    execFileSync('node', ['tools/cli/src/cli.ts', ...args, exported], { cwd: REPO, encoding: 'utf8' });
  expect(cli('validate')).toMatch(/^1 record: no problems, hash [0-9a-f]{16}\.\n$/);
  expect(
    execFileSync('node', ['tools/cli/src/cli.ts', 'sim', exported, '--seeds', '20', '--policy', 'worker'], {
      cwd: REPO,
      encoding: 'utf8',
    }),
  ).toBe(`${after}\n`);
  expect(errors).toEqual([]);
});

test('an imported project’s scripts run only once allowed, and the answer is kept until it is deleted', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // An event only the game declares: an error once the game has run, taken as written before.
  const sunk = JSON.stringify({ rows: [{ id: 'r', when: { event: 'hold/sunk' }, do: [] }] });
  await importHold(page, { 'records/sheet/sunk.json': sunk });
  const panel = await showLogic(page);
  const banner = panel.getByText(/^This project came from a zip or a folder/);
  await expect(banner).toBeVisible();
  await expect(panel.getByText('The game hasn’t run here yet, so content is checked as if it had none.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Run 20 games/ })).toHaveCount(0);
  await expectNoAxeIssues(page);

  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(banner).toHaveCount(0);
  await expect(panel.getByText('The game: hold, starting in sea; 2 actions; bots greedy.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Problems (1)' })).toBeVisible();
  // Run plays what eb sim would, so it waits for the error to go.
  await expect(panel.getByRole('button', { name: 'Run 20 games' })).toBeDisabled();
  await expect(
    panel.getByText('Run plays what eb sim would, so it waits until the project’s error is fixed.'),
  ).toBeVisible();

  // Kept through a reload.
  await showProject(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await showProject(page);
  await libraryRow(page, 'Hold').getByRole('button', { name: 'Open' }).click();
  const again = await showLogic(page);
  await expect(again.getByText('The game: hold, starting in sea; 2 actions; bots greedy.')).toBeVisible();
  await expect(again.getByText(/^This project came from a zip or a folder/)).toHaveCount(0);

  // Deleted and imported again into the same folder: asked again.
  await showProject(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await libraryRow(page, 'Hold').getByRole('button', { name: 'Delete' }).click();
  await libraryRow(page, 'Hold').getByRole('button', { name: 'Delete' }).click();
  await expect(libraryRow(page, 'Hold')).toHaveCount(0);
  await importHold(page);
  await expect((await showLogic(page)).getByText(/^This project came from a zip or a folder/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('a project imported with no scripts runs the first ones made in it, without asking', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Start a game' }).click();
  await expect(panel.getByText('The game: main, starting in play; 2 actions; bots worker.')).toBeVisible();
  await expect(panel.getByText(/^This project came from a zip or a folder/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a script’s problems at their lines, typing undone by the editor’s undo, and a game that never loads', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await createProject(page, 'Broken');
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Start a game' }).click();
  await panel.getByRole('button', { name: /^main\.ts/ }).click();
  const main = scriptRegion(page, 'main');
  await expect(code(main)).toContainText("id: 'main'");
  const impure = firstModuleTemplate('main').replace("ctx.rng('pay').int(1, 3)", 'Math.floor(Math.random() * 3)');
  await replaceText(page, main, impure);
  await expect(panel.getByRole('button', { name: /^main\.ts 1 problem/ })).toBeVisible();
  await expect(panel.getByText('The game can’t run until its scripts’ errors are fixed: see Problems.')).toBeVisible();

  // From Problems to the line, the cursor on it.
  await page.getByRole('tab', { name: 'Problems (1)' }).click();
  await page.getByRole('button', { name: /no Math\.random/ }).click();
  await expect(code(main)).toBeFocused();
  await expect(main.locator('.cm-activeLine')).toContainText('Math.random()');
  await expect(main.getByText('E029: no Math.random (use a seeded rng stream)')).toBeVisible();

  // The editor's undo takes the typing back, in the code as in the file.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(code(main)).toContainText("ctx.rng('pay').int(1, 3)");
  await expect.poll(() => storedText(page, 'broken', 'scripts/main.ts')).toBe(firstModuleTemplate('main'));
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();

  // Completion offers a handler's ctx after "ctx.", from the engine's API list.
  await code(main).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nctx.');
  const offered = page.locator('.cm-tooltip-autocomplete');
  await expect(offered).toContainText('rng');
  await expect(offered).toContainText('emit');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => storedText(page, 'broken', 'scripts/main.ts')).toBe(firstModuleTemplate('main'));

  // The worker has no network or storage to give a script that goes looking.
  await showLogic(page);
  await panel.getByRole('button', { name: /^game\.ts/ }).click();
  const game = scriptRegion(page, 'game');
  const look =
    "const host = [].constructor.constructor('return this')();\nthrow new Error([typeof host.fetch, typeof host.indexedDB].join(' '));\n";
  await replaceText(page, game, look);
  await expect(game.getByText('E031: It threw as it loaded: undefined undefined')).toBeVisible();

  // A game that never finishes loading is stopped, and said to be.
  await replaceText(page, game, 'while (true) {}\n');
  await expect(game.getByText(/^E031: It didn’t finish loading within 5 seconds/)).toBeVisible({ timeout: 15_000 });
  // And the worker started after it runs the next one.
  await replaceText(page, game, gameTemplate('main'));
  await expect(panel.getByText('The game: main, starting in play; 2 actions; bots worker.')).toBeVisible();
  expect(errors).toEqual([]);
});
