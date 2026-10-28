/**
 * M7.4's editor gate (D86, docs/specs/stages.md#the-gate): a stage made in the editor alone, by mouse
 * and keys at 1280 and by touch at 390. The boarding deck imported; New stage in the Logic panel, which
 * opens in the inspector's script editor; a line a stage may not have typed, its problem shown at its
 * line, undone, then the stage given a badge drawn by svg(); the stage named as the deck's Stage with
 * nothing chosen in the space; and, played, the deck drawn by the stage in its worker: frames counted
 * through window.__ebStage2d.code(), the template's colours and the SVG badge's on screen, the alarm's
 * button where the stage boxed it, moved by a drag on the canvas, and pressed. Untested for feel.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { stageTemplate } from '../src/scripts/templates.ts';
import { hands } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { press, showInspector } from './componentHelpers.ts';
import { importDeck, playDeck } from './deckHelpers.ts';
import { expectFits, game } from './hutScreens.ts';
import { showPanel } from './keepEditorHelpers.ts';
import { coloursIn } from './keepHelpers.ts';
import { stored, storedText } from './kitHelpers.ts';
import { showScene } from './spaceHelpers.ts';

const FOLDER = 'deck';
const PLAIN = stageTemplate('plain');

/** The template given a badge: an SVG the page draws for the stage (svg()), drawn at its corner. */
const BADGED = [
  ["import { defineStage, type Start } from 'eb/stage';", "import { defineStage, svg, type Start } from 'eb/stage';"],
  ['let pan = [0, 0];\n', 'let pan = [0, 0];\nlet badge: ImageBitmap | undefined;\n'],
  [
    '    space = s;\n',
    '    space = s;\n    svg(\'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#ff00ff"/></svg>\', 32, 32).then((b) => {\n      badge = b;\n    });\n',
  ],
  ['    return { uses };', '    if (badge) g.drawImage(badge, 8, 8);\n    return { uses };'],
].reduce((text, [from, to]) => {
  if (text.split(from as string).length !== 2) throw new Error(`The template has changed: ${from}`);
  return text.replace(from as string, to as string);
}, PLAIN);

interface CodeSeen {
  readonly stage: string;
  readonly frames: number;
  readonly ms: number;
  readonly boxed: readonly string[];
  readonly unboxed: readonly string[];
  readonly error?: string;
}

async function code(page: Page): Promise<CodeSeen | undefined> {
  // biome-ignore lint/suspicious/noExplicitAny: the page's own hook, read as it is
  return page.evaluate(() => (window as any).__ebStage2d?.code?.());
}

/** A press at `from`, dragged by `by`, let go: the mouse's, or a finger's. */
async function drag(page: Page, from: [number, number], by: [number, number], touch: boolean): Promise<void> {
  if (!touch) {
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(from[0] + by[0], from[1] + by[1], { steps: 8 });
    await page.mouse.up();
    return;
  }
  const fingers = await hands(page);
  try {
    await fingers.press(1, ...from);
    await fingers.slide(1, ...by);
    await fingers.lift(1);
  } finally {
    await fingers.close();
  }
}

async function boxOf(target: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error('Not shown');
  return box;
}

for (const { viewport, touch } of [
  { viewport: { width: 1280, height: 800 }, touch: false },
  { viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`a stage in the editor, ${viewport.width} wide`, () => {
    test.use({ viewport, ...(touch ? { hasTouch: true, isMobile: true } : {}), actionTimeout: 20_000 });

    test('a stage made with New stage, a problem at its line undone, named as the deck’s Stage, and played', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      await importDeck(page, touch);

      await test.step('New stage: written from the template, opened in the script editor', async () => {
        const logic = await showPanel(page, 'Logic', touch);
        await expect(logic.getByRole('heading', { name: 'Stages' })).toBeVisible();
        await expect(logic.getByText(/^No stages yet\./)).toBeVisible();
        await press(logic.getByRole('button', { name: 'New stage' }), touch);
        await logic.getByLabel('Name of the new stage').fill('Plain');
        await press(logic.getByRole('button', { name: 'Create' }), touch);
        await expect.poll(() => storedText(page, FOLDER, 'stages/plain.ts')).toBe(PLAIN);
        // Until a space names it, it is left out of the pack, and W159 says so.
        await expect(logic.getByRole('button', { name: /^plain\.ts 1 problem/ })).toBeVisible();
        // The stage is the author's, the deck's scripts still aren't: it asks before they run (D38). New stage
        // pressed before the deck's scripts were first read trusted them unasked (CI, M7.4).
        await expect(logic.getByRole('button', { name: 'Run its scripts' })).toBeVisible();
        const form = await showInspector(page, touch);
        const stage = form.getByRole('region', { name: 'Stage plain.ts' });
        await expect(stage.locator('.cm-content')).toContainText('defineStage');
        await expect(stage.getByRole('list', { name: 'Problems in this stage' })).toHaveText(
          'W159: No space names a stage, so nothing draws with it',
        );
        await expectFits(page);
      });

      await test.step('a line a stage may not have: its problem at its line, undone, then a badge', async () => {
        const form = await showInspector(page, touch);
        const stage = form.getByRole('region', { name: 'Stage plain.ts' });
        const text = stage.locator('.cm-content');
        await press(text, touch);
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.insertText(`${PLAIN}const host = postMessage;\n`);
        const problems = stage.getByRole('list', { name: 'Problems in this stage' });
        await expect(problems).toContainText(
          'E029: no self or postMessage (a stage answers through what frame returns)',
        );
        const line = PLAIN.split('\n').length;
        await press(problems.getByRole('button', { name: `Line ${line}` }), touch);
        await expect(stage.locator('.cm-activeLine')).toContainText('const host = postMessage;');
        await page.keyboard.press('ControlOrMeta+z');
        await expect.poll(() => storedText(page, FOLDER, 'stages/plain.ts')).toBe(PLAIN);
        await expect(problems).toHaveText('W159: No space names a stage, so nothing draws with it');
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.insertText(BADGED);
        await expect.poll(() => storedText(page, FOLDER, 'stages/plain.ts')).toBe(BADGED);
        await expect(problems).toHaveText('W159: No space names a stage, so nothing draws with it');
      });

      await test.step('named as the deck’s Stage, with nothing chosen in the space', async () => {
        const scene = await showScene(page);
        await press(scene.getByRole('button', { name: /^The boarding deck \(deck\)/ }), touch);
        const form = await showInspector(page, touch);
        const field = form.getByLabel('Stage', { exact: true });
        await expect(field).toHaveValue('');
        await field.selectOption('plain');
        await expect
          .poll(async () => ((await stored(page, FOLDER, 'spaces/deck.json')) as { stage?: string } | null)?.stage)
          .toBe('plain');
        await expectFits(page);
        // Named, it is packed: W159 is gone, as the stage's own editor says once opened from the field.
        await press(form.getByRole('button', { name: 'Open plain.ts' }), touch);
        const stage = (await showInspector(page, touch)).getByRole('region', { name: 'Stage plain.ts' });
        await expect(stage.getByText('No problems.')).toBeVisible();
      });

      await test.step('played: drawn by the stage, the alarm’s button where it boxed it, dragged, pressed', async () => {
        const box = await playDeck(page, touch);
        await expect
          .poll(async () => {
            const seen = await code(page);
            return seen ? { stage: seen.stage, drawing: seen.frames > 3, boxed: seen.boxed, error: seen.error } : null;
          })
          .toEqual({ stage: 'plain', drawing: true, boxed: ['alarm'], error: undefined });
        expect((await code(page))?.unboxed).toEqual([]);

        // The template's colours: the walkable cells, the dark ones and the crew's dots; and the badge
        // the page drew from its SVG, 32 px square.
        const canvasLocator = box.locator('canvas.eb-stage-canvas');
        await expect.poll(async () => (await coloursIn(page, canvasLocator)).get('#ff00ff') ?? 0).toBeGreaterThan(600);
        const colours = await coloursIn(page, canvasLocator);
        for (const hex of ['#3b4258', '#1c2030', '#f2c14e']) expect(colours.get(hex) ?? 0).toBeGreaterThan(10);

        // A drag on the canvas pans the template's board, and the button goes with the box it returns.
        const alarm = box.getByRole('button', { name: 'Sound the alarm' });
        await expect(alarm).toBeVisible();
        const before = await boxOf(alarm);
        expect(Math.min(before.width, before.height)).toBeGreaterThanOrEqual(44);
        const canvas = await boxOf(box.locator('canvas.eb-stage-canvas'));
        await drag(page, [canvas.x + 6, canvas.y + 6], [30, 20], touch);
        await expect
          .poll(async () => {
            const after = await boxOf(alarm);
            return [Math.round(after.x - before.x), Math.round(after.y - before.y)];
          })
          .toEqual([30, 20]);

        await press(alarm, touch);
        // CI's 390 run once saw no line in 5 s (2026-10-28): what the stage sent says whether the press was
        // dropped, is waiting on the sim, or was answered with no line.
        await expect(game(page).getByText('The alarm is sounding.'))
          .toBeVisible()
          .catch(async (error: Error) => {
            const used = await page.evaluate(() =>
              (window as { __ebStage2d?: { used?: () => unknown } }).__ebStage2d?.used?.(),
            );
            throw new Error(`${error.message}\nthe stage's uses: ${JSON.stringify(used)}`);
          });
        expect((await code(page))?.error).toBeUndefined();
        await expectFits(page);
      });

      expect(errors).toEqual([]);
    });
  });
}
