/**
 * M7.1's editor gate (D83, docs/specs/2d-scenes.md#the-gate): a 2D space built from the starter
 * sprites in the editor alone, by mouse and keys at 1280 and by touch at 390. From a new project:
 * the starter sprites added; a 2D space; the night sky, the far ridge and the keep's wall placed in
 * the middle of the view; the ridge made a parallax layer with forms; the wall moved by a drag and
 * by the arrow keys, to the pixel; zoomed and framed; the torch's clip previewed above its form; and,
 * with a game started and a Space screen, played, the stage drawing the wall where the editor left
 * it. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { choose, press, showInspector } from './componentHelpers.ts';
import { expectFits, game, newGame, showPlay } from './hutScreens.ts';
import {
  addStarterSprites,
  dragBy,
  drawnBox,
  newWall,
  placed,
  placeSprite,
  showPanel,
  view2d,
} from './keepEditorHelpers.ts';
import { stage2d } from './keepHelpers.ts';
import { createProject } from './kitHelpers.ts';
import { recordLink, recordsTable } from './ludus.ts';

for (const { viewport, touch } of [
  { viewport: { width: 1280, height: 800 }, touch: false },
  { viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`a 2D space in the editor, ${viewport.width} wide`, () => {
    test.use({ viewport, ...(touch ? { hasTouch: true, isMobile: true } : {}), actionTimeout: 20_000 });

    test('built from the starter sprites, moved to the pixel, a layer in parallax, a clip previewed, played', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await createProject(page, 'Night wall');
      await addStarterSprites(page, touch);
      const view = await newWall(page, touch);
      // A new 2D space is framed on its fit, 320 × 180, and Add puts things in its middle.
      expect((await view2d(page)).centre).toEqual([160, 90]);

      await test.step('the sky, the far ridge and the wall placed in the middle of the view', async () => {
        await placeSprite(page, /^Night sky/, 'sky-night', touch);
        expect((await placed(page, 'sky-night'))?.at).toEqual([160, 90, 0]);
        await placeSprite(page, /^Far ridge/, 'ridge-far', touch);
        await placeSprite(page, /^Keep wall/, 'keep-wall', touch);
        const drawn = (await view2d(page)).drawn.map((d) => d.path);
        expect(drawn).toEqual(['sky-night', 'ridge-far', 'keep-wall']);
        // The 2D view, its toolbar and its Add row: nothing past the edges, every target 44 px, nothing axe finds.
        await press(page.getByRole('button', { name: 'Add', exact: true }), touch);
        await expectFits(page);
        await press(page.getByRole('button', { name: 'Add', exact: true }), touch);
      });

      await test.step('the wall dragged, then nudged by the arrow keys, to the pixel', async () => {
        const { zoom } = await view2d(page);
        // 40 CSS pixels right and 24 up, at 1 device pixel a CSS pixel: whole art pixels at this zoom.
        const by = [40, -24] as const;
        await dragBy(page, await drawnBox(page, 'keep-wall'), by, touch);
        const moved = [160 + Math.round(by[0] / zoom), 90 + Math.round(-by[1] / zoom)];
        await expect.poll(async () => (await placed(page, 'keep-wall'))?.at).toEqual([moved[0], moved[1], 0]);
        await view.focus();
        for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Shift+ArrowUp');
        await expect
          .poll(async () => (await placed(page, 'keep-wall'))?.at)
          .toEqual([(moved[0] as number) + 3, (moved[1] as number) + 8, 0]);
        // Presses in a row are one step: one undo takes all four back, and one redo puts them again.
        await page.keyboard.press('Control+z');
        await expect.poll(async () => (await placed(page, 'keep-wall'))?.at).toEqual([moved[0], moved[1], 0]);
        await page.keyboard.press('Control+Shift+Z');
        await expect
          .poll(async () => (await placed(page, 'keep-wall'))?.at)
          .toEqual([(moved[0] as number) + 3, (moved[1] as number) + 8, 0]);
      });

      await test.step('zoomed in a whole step, and framed on the wall', async () => {
        const before = (await view2d(page)).zoom;
        await press(page.getByRole('button', { name: 'Zoom in' }), touch);
        await expect.poll(async () => (await view2d(page)).zoom).toBe(before + 1);
        await press(page.getByRole('button', { name: 'Frame', exact: true }), touch);
        const wall = (await placed(page, 'keep-wall'))?.at as number[];
        // The wall's frame is 64 × 32 from its foot at the bottom middle: Frame centres on that box.
        await expect.poll(async () => (await view2d(page)).centre).toEqual([wall[0], (wall[1] as number) + 16]);
      });

      await test.step('the far ridge made a parallax layer with forms', async () => {
        const form = await choose(page, 'ridge-far', touch);
        await form.getByLabel('Add a component').selectOption({ label: 'Parallax' });
        for (let i = 0; i < 2; i++) await press(form.getByRole('button', { name: 'Add to Factor' }), touch);
        // Each number has a slider beside its box: the box is typed into.
        await form.getByRole('textbox', { name: 'Factor, item 1' }).fill('0.3');
        await form.getByRole('textbox', { name: 'Factor, item 2' }).fill('1');
        await expect
          .poll(async () => ((await placed(page, 'ridge-far'))?.components as { parallax?: unknown })?.parallax)
          .toEqual({ factor: [0.3, 1] });
      });

      await test.step('the torch’s clip previewed above its form', async () => {
        await showPanel(page, 'Records', touch);
        await page.getByLabel('Type', { exact: true }).selectOption('sprite');
        await press(recordLink(recordsTable(page, 'Sprite'), 'torch'), touch);
        const form = await showInspector(page, touch);
        await expect(form.getByRole('region', { name: 'Sprite torch' })).toBeVisible();
        const clip = form.locator('canvas[data-clip="burn"]');
        await expect(clip).toBeVisible();
        const frames = new Set<string>();
        for (let i = 0; i < 20 && frames.size < 2; i++) {
          frames.add((await clip.getAttribute('data-frame')) ?? '');
          await page.waitForTimeout(100);
        }
        expect(frames.size).toBeGreaterThanOrEqual(2);
        await expectFits(page);
      });

      await test.step('played: a game started, a Space screen, the wall drawn where it was left', async () => {
        const logic = await showPanel(page, 'Logic', touch);
        await press(logic.getByRole('button', { name: 'Start a game' }), touch);
        await expect(logic.getByRole('button', { name: /^game\.ts/ })).toBeVisible();
        const panel = await showPlay(page);
        await press(panel.getByRole('button', { name: 'New screen' }), touch);
        await panel.getByLabel('Template').selectOption({ label: 'Space' });
        await press(panel.getByRole('button', { name: 'Create' }), touch);
        await expect(page.getByRole('region', { name: 'Screen space' })).toBeVisible();
        const played = await showPlay(page);
        const play = played.getByRole('button', { name: 'Play', exact: true });
        await expect(play).toBeEnabled();
        await press(play, touch);
        await newGame(page, (button) => press(button, touch));
        await expect(game(page).getByRole('application', { name: 'Wall' })).toBeVisible();
        const wall = (await placed(page, 'keep-wall'))?.at as number[];
        await expect
          .poll(async () => (await stage2d(page)).drawn.find((d) => d.path === 'keep-wall')?.at)
          .toEqual([wall[0], wall[1]]);
      });

      expect(errors).toEqual([]);
    });
  });
}
