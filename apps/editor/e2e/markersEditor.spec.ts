/**
 * M6.6's gate in the editor (D78, docs/specs/markers.md#the-gate), at 1280 and 390 wide: the glen
 * opened in the Scene panel and its map baked by Bake map, the JSON stored with the hash of what was
 * drawn beside a WebP; the rope moved, and W154 in the Problems panel and the Map row; baked again and
 * the warning gone. The gate's objective, its target taken out of the fixture, given one with the
 * quest's form alone: the space, then an object among that space's. And in Play, the Map screen drawn
 * on the baked image, the gate's pin where the form put it.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { press, showInspector, showOutliner } from './componentHelpers.ts';
import { GLEN } from './glenHelpers.ts';
import { newGame, showPlay } from './hutScreens.ts';
import { fixtureZip, stored, storedText } from './kitHelpers.ts';
import { openProject, openRecord, showProject } from './ludus.ts';
import { openScreen, pins } from './markerHelpers.ts';
import { outlinerRow, scenePanel, showScene, viewStarted } from './spaceHelpers.ts';
import { drawing } from './walkHelpers.ts';

const FOLDER = 'glen';
const STALE = 'Baked before the space last changed: press Bake map again';
const BAKED = /^Baked: 1024 px over (\d+) m, (\d+) kB of WEBP\.$/;

/** The glen as a zip with the gate's objective given no target. */
function glenWithoutGate(): string {
  const dir = mkdtempSync(join(tmpdir(), 'glen-'));
  cpSync(GLEN, dir, { recursive: true });
  const path = join(dir, 'records/quest/settle.json');
  const settle = JSON.parse(readFileSync(path, 'utf8'));
  delete settle.stages[0].objectives[1].target;
  writeFileSync(path, `${JSON.stringify(settle, null, 2)}\n`);
  return fixtureZip(dir, FOLDER);
}

async function showProblems(page: Page, touch: boolean): Promise<Locator> {
  await press(page.getByRole('tab', { name: /^Problems/ }), touch);
  const panel = page.locator('[data-panel="problems"]');
  await expect(panel.getByRole('heading', { name: 'Problems' })).toBeVisible();
  return panel;
}

/** The Scene toolbar's Map row, open, the phone's inspector sheet folded down off it first. */
async function mapRow(page: Page, touch: boolean): Promise<Locator> {
  await showScene(page);
  const handle = page.locator('.sheet-handle');
  if ((await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'true') await handle.tap();
  const toggle = scenePanel(page).getByRole('button', { name: 'Map', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await press(toggle, touch);
  return scenePanel(page).locator('fieldset.scene-terrain');
}

const mapFile = (page: Page) =>
  stored(page, FOLDER, 'spaces/glen.map.json') as Promise<{
    bounds: number[];
    size: number[];
    image: string;
    hash: string;
  } | null>;

/** Bake map pressed: the row says what it wrote, and how long it took, for the Readings. */
async function bake(page: Page, touch: boolean): Promise<void> {
  const row = await mapRow(page, touch);
  const started = Date.now();
  await press(row.getByRole('button', { name: 'Bake map' }), touch);
  await expect(row.getByRole('status')).toHaveText(BAKED, { timeout: 30_000 });
  const said = (await row.getByRole('status').textContent()) ?? '';
  console.log(`bake map, ${page.viewportSize()?.width} wide: ${Date.now() - started} ms; ${said}`);
}

for (const [width, height, touch] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`the glen’s map and targets in the editor, ${width} wide`, () => {
    test.use({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });

    test('a map baked, W154 after a move, baked again; the gate’s target set with forms and pinned in play', async ({
      page,
    }) => {
      test.setTimeout(400_000);
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        press(page.getByRole('button', { name: 'Import zip' }), touch),
      ]);
      await chooser.setFiles(glenWithoutGate());
      await expect(openProject(page).getByRole('heading', { name: 'The glen' })).toBeVisible();
      const panel = await showScene(page);
      await press(panel.getByRole('button', { name: /^The glen \(glen\)/ }), touch);
      await viewStarted(page);

      let hash = '';
      await test.step('Bake map: the JSON and a WebP, the hash of what was drawn', async () => {
        const row = await mapRow(page, touch);
        await expect(row.getByRole('status')).toHaveText('No map yet: bake one so the Map screen can show this space.');
        await bake(page, touch);
        await expect.poll(() => mapFile(page)).not.toBeNull();
        const file = await mapFile(page);
        expect(file).toMatchObject({ size: [1024, 1024], image: 'glen.map.webp' });
        expect(file?.hash).toMatch(/^[0-9a-f]{16}$/);
        const [x0, z0, x1, z1] = file?.bounds ?? [];
        // Squared up round the objects with 4 m to spare: the ground's 30 m and more.
        expect((x1 as number) - (x0 as number)).toBe((z1 as number) - (z0 as number));
        expect((x1 as number) - (x0 as number)).toBeGreaterThanOrEqual(30);
        expect((await storedText(page, FOLDER, 'spaces/glen.map.webp'))?.slice(0, 4)).toBe('RIFF');
        hash = file?.hash ?? '';
      });

      await test.step('the rope moved 1 m: W154, in the Problems panel and the row', async () => {
        const outliner = await showOutliner(page, touch);
        await press(outlinerRow(outliner, 'Rope'), touch);
        const form = await showInspector(page, touch);
        const z = form.getByRole('group', { name: 'Place, in metres' }).getByLabel('z', { exact: true });
        await z.fill('5.5');
        await z.press('Enter');
        const problems = await showProblems(page, touch);
        await expect(problems.getByText(STALE)).toBeVisible();
        const row = await mapRow(page, touch);
        await expect(row.getByRole('status')).toHaveText('Baked before the space last changed: bake it again.');
      });

      await test.step('baked again: a new hash, and the warning gone', async () => {
        await bake(page, touch);
        await expect.poll(async () => (await mapFile(page))?.hash).not.toBe(hash);
        const problems = await showProblems(page, touch);
        await expect(problems.getByText(STALE)).toHaveCount(0);
        await expect(page.getByRole('tab', { name: /^Problems/ })).toHaveText('Problems');
      });

      await test.step('the gate’s target: the space from the project’s, the object from that space’s', async () => {
        const quest = await openRecord(page, 'quest', 'settle');
        const gate = quest
          .getByRole('group', { name: 'Stages, item 1', exact: true })
          .getByRole('group', { name: 'Objectives, item 2', exact: true });
        await press(gate.getByRole('button', { name: 'Add Target', exact: true }), touch);
        const target = gate.getByRole('group', { name: 'Target (optional)', exact: true });
        const space = target.getByLabel(/^Space/);
        const object = target.getByLabel(/^Object/);
        await expect(space.locator('option')).toHaveText(['None', 'bothy', 'glen', 'shed']);
        await expect(object.locator('option')).toHaveText(['None']);
        await space.selectOption('glen');
        await expect(object.locator('option')).toHaveText([
          'None',
          'bothy',
          'bothy-door',
          'bothy-out',
          'gate',
          'ground',
          'rope',
          'shed',
          'shed-door',
          'shed-out',
          'start',
        ]);
        await object.selectOption('gate');
        await expect
          .poll(async () => {
            const settle = (await stored(page, FOLDER, 'records/quest/settle.json')) as {
              stages: { objectives: { target?: unknown }[] }[];
            } | null;
            return settle?.stages[0]?.objectives[1]?.target;
          })
          .toEqual({ space: 'glen', object: 'gate' });
        await expect(page.getByRole('tab', { name: /^Problems/ })).toHaveText('Problems');
      });

      await test.step('in Play, the Map screen on the baked image, the gate pinned where the form put it', async () => {
        const play = await showPlay(page);
        await press(play.getByRole('button', { name: 'Run its scripts' }), touch);
        const start = play.getByRole('button', { name: 'Play', exact: true });
        await expect(start).toBeEnabled();
        await press(start, touch);
        await newGame(page, (button) => press(button, touch));
        await drawing(page, 'glen', 'The glen');
        const map = await openScreen(page, 'Map', (button) => press(button, touch));
        const image = map.locator('.eb-space-map-image');
        await expect(image).toBeVisible();
        expect(await image.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(1024);
        expect(await image.getAttribute('src')).toMatch(/^data:image\/webp;base64,/);
        await expect
          .poll(async () => (await pins(map)).filter((pin) => pin.kind === 'target'))
          .toEqual([
            { kind: 'target', objective: 'rope', at: [0, 5.5] },
            { kind: 'target', objective: 'gate', at: [3, -2.5] },
          ]);
      });
      expect(errors).toEqual([]);
    });
  });
}
